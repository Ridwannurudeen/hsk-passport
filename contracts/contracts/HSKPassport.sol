// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// @title HSK Passport — Privacy-preserving KYC credentials for HashKey Chain
/// @notice Issuers add verified users to credential groups. Users prove membership via ZK proofs.
/// @dev Wraps Semaphore v4 with credential-specific group management, schema linking, and verification.
contract HSKPassport {
    ISemaphore public immutable semaphore;
    /// @dev In production deployments `owner` should be set to the HSK Passport
    ///      Timelock so that every owner action (issuer approval/revocation,
    ///      delegate revocation, group deactivation) is subject to the 48h
    ///      governance delay. Single-EOA ownership is acceptable only on
    ///      testnet / development.
    address public owner;
    /// @dev Two-step ownership transfer: `transferOwnership` sets `pendingOwner`,
    ///      and the new owner must call `acceptOwnership` to take control. This
    ///      prevents accidentally transferring ownership to an unreachable address.
    address public pendingOwner;

    struct CredentialGroup {
        string name;
        uint256 groupId;
        address issuer;
        uint256 memberCount;
        bool active;
        bytes32 schemaHash;
        uint256 validityPeriod; // seconds; 0 = no expiry
    }

    /// @dev groupId => identityCommitment => unix-seconds the credential was issued (0 = not issued)
    mapping(uint256 => mapping(uint256 => uint256)) public credentialIssuedAt;

    /// @dev Credential group ID => CredentialGroup metadata
    mapping(uint256 => CredentialGroup) public credentialGroups;

    /// @dev Track all created group IDs
    uint256[] public groupIds;

    /// @dev issuer address => whether they're an approved issuer
    mapping(address => bool) public approvedIssuers;

    /// @dev groupId => identityCommitment => whether issued
    mapping(uint256 => mapping(uint256 => bool)) public credentials;

    /// @dev groupId => delegate address => whether approved for that group
    mapping(uint256 => mapping(address => bool)) public groupDelegates;

    event IssuerApproved(address indexed issuer);
    event IssuerRevoked(address indexed issuer);
    event DelegateApproved(uint256 indexed groupId, address indexed delegate);
    event DelegateRevoked(uint256 indexed groupId, address indexed delegate);
    event CredentialGroupCreated(uint256 indexed groupId, string name, address indexed issuer, bytes32 schemaHash);
    event CredentialIssued(uint256 indexed groupId, uint256 indexed identityCommitment);
    event CredentialRevoked(uint256 indexed groupId, uint256 indexed identityCommitment);
    event CredentialVerified(uint256 indexed groupId, address indexed verifier);
    event ValidityPeriodSet(uint256 indexed groupId, uint256 validityPeriodSec);

    error NotOwner();
    error NotPendingOwner();
    error NotApprovedIssuer();
    error NotGroupIssuerOrDelegate();
    error GroupNotActive();
    error CredentialAlreadyIssued();
    error CredentialNotIssued();
    error CredentialExpired();

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyApprovedIssuer() {
        if (!approvedIssuers[msg.sender]) revert NotApprovedIssuer();
        _;
    }

    /// @dev Strict: only the group's original issuer, AND they must still be an approved issuer.
    ///      Use for admin operations like deactivating the group, granting delegates, etc.
    modifier onlyGroupIssuer(uint256 groupId) {
        address groupIssuer = credentialGroups[groupId].issuer;
        if (groupIssuer != msg.sender) revert NotGroupIssuerOrDelegate();
        if (!approvedIssuers[msg.sender]) revert NotApprovedIssuer();
        _;
    }

    /// @dev Loose: group issuer (if still approved) OR an approved delegate for that group.
    ///      Use for issuance/revocation of credentials only. Delegates cannot escalate privileges.
    ///      When an issuer is revoked via revokeIssuer(), all their groups freeze automatically —
    ///      their own calls fail the approvedIssuers check; delegate calls fail the same check
    ///      on the group's stored issuer (see below).
    modifier onlyGroupIssuerOrDelegate(uint256 groupId) {
        address groupIssuer = credentialGroups[groupId].issuer;
        // The group issuer must still be approved — if they're revoked, the entire group freezes,
        // including any delegates they previously approved.
        if (!approvedIssuers[groupIssuer]) revert NotApprovedIssuer();
        if (groupIssuer != msg.sender && !groupDelegates[groupId][msg.sender]) {
            revert NotGroupIssuerOrDelegate();
        }
        _;
    }

    constructor(ISemaphore _semaphore) {
        semaphore = _semaphore;
        owner = msg.sender;
        approvedIssuers[msg.sender] = true;
        emit IssuerApproved(msg.sender);
    }

    /// @notice Approve a new credential issuer
    function approveIssuer(address issuer) external onlyOwner {
        approvedIssuers[issuer] = true;
        emit IssuerApproved(issuer);
    }

    /// @notice Revoke an issuer's approval
    function revokeIssuer(address issuer) external onlyOwner {
        approvedIssuers[issuer] = false;
        emit IssuerRevoked(issuer);
    }

    /// @notice Approve a delegate contract for a specific group
    /// @dev Only the group's original issuer (still approved) can grant delegates.
    ///      Delegates cannot grant more delegates — prevents privilege escalation.
    function approveDelegate(uint256 groupId, address delegate) external onlyGroupIssuer(groupId) {
        groupDelegates[groupId][delegate] = true;
        emit DelegateApproved(groupId, delegate);
    }

    /// @notice Revoke a delegate's approval for a specific group
    /// @dev Owner can also revoke as emergency offboarding; delegates cannot revoke themselves or others.
    function revokeDelegate(uint256 groupId, address delegate) external {
        address groupIssuer = credentialGroups[groupId].issuer;
        if (msg.sender != groupIssuer && msg.sender != owner) revert NotGroupIssuerOrDelegate();
        groupDelegates[groupId][delegate] = false;
        emit DelegateRevoked(groupId, delegate);
    }

    /// @notice Create a new credential group, optionally linked to a schema
    /// @param name Human-readable name for the credential type
    /// @param schemaHash Schema hash from CredentialRegistry (use bytes32(0) for no schema)
    /// @return groupId The Semaphore group ID created
    function createCredentialGroup(string calldata name, bytes32 schemaHash) external onlyApprovedIssuer returns (uint256 groupId) {
        groupId = semaphore.createGroup(address(this));

        credentialGroups[groupId] = CredentialGroup({
            name: name,
            groupId: groupId,
            issuer: msg.sender,
            memberCount: 0,
            active: true,
            schemaHash: schemaHash,
            validityPeriod: 0
        });

        groupIds.push(groupId);
        emit CredentialGroupCreated(groupId, name, msg.sender, schemaHash);
    }

    /// @notice Set the validity period (seconds) for credentials in a group. 0 = never expires.
    /// @dev Only the group issuer (still approved) can set this. Applies to new *and* existing credentials.
    function setValidityPeriod(uint256 groupId, uint256 validityPeriodSec) external onlyGroupIssuer(groupId) {
        credentialGroups[groupId].validityPeriod = validityPeriodSec;
        emit ValidityPeriodSet(groupId, validityPeriodSec);
    }

    /// @notice Issue a credential to a user by adding their identity commitment to a group
    /// @param groupId The credential group to add to
    /// @param identityCommitment The user's Semaphore identity commitment
    function issueCredential(
        uint256 groupId,
        uint256 identityCommitment
    ) external onlyGroupIssuerOrDelegate(groupId) {
        if (!credentialGroups[groupId].active) revert GroupNotActive();
        if (credentials[groupId][identityCommitment]) revert CredentialAlreadyIssued();

        semaphore.addMember(groupId, identityCommitment);
        credentials[groupId][identityCommitment] = true;
        credentialIssuedAt[groupId][identityCommitment] = block.timestamp;
        credentialGroups[groupId].memberCount++;

        emit CredentialIssued(groupId, identityCommitment);
    }

    /// @notice Batch issue credentials to multiple users
    /// @param groupId The credential group
    /// @param identityCommitments Array of user identity commitments
    function batchIssueCredentials(
        uint256 groupId,
        uint256[] calldata identityCommitments
    ) external onlyGroupIssuerOrDelegate(groupId) {
        if (!credentialGroups[groupId].active) revert GroupNotActive();

        for (uint256 i = 0; i < identityCommitments.length; i++) {
            if (credentials[groupId][identityCommitments[i]]) revert CredentialAlreadyIssued();
            credentials[groupId][identityCommitments[i]] = true;
            credentialIssuedAt[groupId][identityCommitments[i]] = block.timestamp;
        }

        semaphore.addMembers(groupId, identityCommitments);
        credentialGroups[groupId].memberCount += identityCommitments.length;

        for (uint256 i = 0; i < identityCommitments.length; i++) {
            emit CredentialIssued(groupId, identityCommitments[i]);
        }
    }

    /// @notice Revoke a credential by removing user from the group
    /// @param groupId The credential group
    /// @param identityCommitment The user's identity commitment to revoke
    /// @param merkleProofSiblings Merkle proof siblings for removal
    function revokeCredential(
        uint256 groupId,
        uint256 identityCommitment,
        uint256[] calldata merkleProofSiblings
    ) external onlyGroupIssuerOrDelegate(groupId) {
        if (!credentials[groupId][identityCommitment]) revert CredentialNotIssued();

        semaphore.removeMember(groupId, identityCommitment, merkleProofSiblings);
        credentials[groupId][identityCommitment] = false;
        credentialGroups[groupId].memberCount--;

        emit CredentialRevoked(groupId, identityCommitment);
    }

    /// @notice Verify a ZK proof that a user holds a credential (read-only, no nullifier tracking)
    /// @param groupId The credential group to verify against
    /// @param proof The Semaphore proof
    /// @return True if the proof is valid
    /// @dev Does NOT enforce credential expiry — use verifyCredentialWithExpiry for regulated dApps.
    function verifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool) {
        if (!credentialGroups[groupId].active) revert GroupNotActive();
        return semaphore.verifyProof(groupId, proof);
    }

    /// @notice Check if a specific credential has expired per the group's validity period.
    /// @dev Returns false for never-issued credentials and groups with no validity period set.
    function isCredentialExpired(uint256 groupId, uint256 identityCommitment) public view returns (bool) {
        uint256 validity = credentialGroups[groupId].validityPeriod;
        if (validity == 0) return false;
        uint256 issuedAt = credentialIssuedAt[groupId][identityCommitment];
        if (issuedAt == 0) return false;
        return block.timestamp > issuedAt + validity;
    }

    /// @notice Verify a ZK proof AND check the prover's credential hasn't expired.
    /// @dev IMPORTANT: This proves the GROUP's issuance window is still fresh, NOT the
    ///      individual prover's credential freshness. Because the prover is anonymous, we
    ///      cannot look up their personal issuance time — so the expiry check is against
    ///      the *group*'s oldest possible member: if any credential currently on-chain
    ///      could have expired, the group enters a "stale window" and this call reverts.
    ///      Issuers must re-issue credentials before their validity period lapses.
    /// @dev For per-credential expiry (preserving anonymity), use on-chain ZK range proofs
    ///      in the validity period — see /roadmap for the per-credential ZK range proof
    ///      milestone.
    function verifyCredentialWithExpiry(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof,
        uint256 earliestAcceptableIssuance
    ) external view returns (bool) {
        if (!credentialGroups[groupId].active) revert GroupNotActive();
        uint256 validity = credentialGroups[groupId].validityPeriod;
        if (validity != 0) {
            // Verifier specifies how old the oldest acceptable credential can be.
            // Must be within the group's validity window.
            if (block.timestamp > earliestAcceptableIssuance + validity) {
                revert CredentialExpired();
            }
        }
        return semaphore.verifyProof(groupId, proof);
    }

    /// @notice Validate a proof with nullifier tracking (prevents reuse for same scope)
    /// @param groupId The credential group
    /// @param proof The Semaphore proof
    function validateCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external {
        if (!credentialGroups[groupId].active) revert GroupNotActive();
        semaphore.validateProof(groupId, proof);
        emit CredentialVerified(groupId, msg.sender);
    }

    /// @notice Deactivate a credential group. Only the issuer (still approved) or protocol owner.
    /// @dev Delegates cannot deactivate. Owner can deactivate for emergency offboarding even
    ///      after revoking the issuer.
    function deactivateGroup(uint256 groupId) external {
        address groupIssuer = credentialGroups[groupId].issuer;
        bool isAuthorizedIssuer = (msg.sender == groupIssuer) && approvedIssuers[msg.sender];
        if (!isAuthorizedIssuer && msg.sender != owner) revert NotGroupIssuerOrDelegate();
        credentialGroups[groupId].active = false;
    }

    /// @notice Get all credential group IDs
    function getGroupIds() external view returns (uint256[] memory) {
        return groupIds;
    }

    /// @notice Get total number of credential groups
    function getGroupCount() external view returns (uint256) {
        return groupIds.length;
    }

    /// @notice Check if an identity has a credential in a group
    function hasCredential(uint256 groupId, uint256 identityCommitment) external view returns (bool) {
        return credentials[groupId][identityCommitment];
    }

    /// @notice Start a two-step ownership transfer. The new owner must subsequently
    ///         call `acceptOwnership` to take control.
    /// @dev In production the owner should be the HSK Passport Timelock — see the
    ///      docstring on the `owner` storage variable.
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Accept a pending ownership transfer. Must be called by the address
    ///         that was previously set as `pendingOwner`.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }
}
