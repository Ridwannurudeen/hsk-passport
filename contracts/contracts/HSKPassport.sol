// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// @title HSK Passport — Privacy-preserving KYC credentials for HashKey Chain
/// @notice Issuers add verified users to credential groups. Users prove membership via ZK proofs.
/// @dev Wraps Semaphore v4 with credential-specific group management, schema linking, and verification.
contract HSKPassport {
    ISemaphore public immutable semaphore;
    address public owner;

    struct CredentialGroup {
        string name;
        uint256 groupId;
        address issuer;
        uint256 memberCount;
        bool active;
        bytes32 schemaHash;
    }

    /// @dev Credential group ID => CredentialGroup metadata
    mapping(uint256 => CredentialGroup) public credentialGroups;

    /// @dev Track all created group IDs
    uint256[] public groupIds;

    /// @dev issuer address => whether they're an approved issuer
    mapping(address => bool) public approvedIssuers;

    /// @dev groupId => identityCommitment => whether issued
    mapping(uint256 => mapping(uint256 => bool)) public credentials;

    /// @dev address => whether it's an approved delegate (e.g., DemoIssuer contract)
    mapping(address => bool) public approvedDelegates;

    event IssuerApproved(address indexed issuer);
    event IssuerRevoked(address indexed issuer);
    event DelegateApproved(address indexed delegate);
    event DelegateRevoked(address indexed delegate);
    event CredentialGroupCreated(uint256 indexed groupId, string name, address indexed issuer, bytes32 schemaHash);
    event CredentialIssued(uint256 indexed groupId, uint256 indexed identityCommitment);
    event CredentialRevoked(uint256 indexed groupId, uint256 indexed identityCommitment);
    event CredentialVerified(uint256 indexed groupId, address indexed verifier);

    error NotOwner();
    error NotApprovedIssuer();
    error NotGroupIssuerOrDelegate();
    error GroupNotActive();
    error CredentialAlreadyIssued();
    error CredentialNotIssued();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyApprovedIssuer() {
        if (!approvedIssuers[msg.sender]) revert NotApprovedIssuer();
        _;
    }

    modifier onlyGroupIssuerOrDelegate(uint256 groupId) {
        if (credentialGroups[groupId].issuer != msg.sender && !approvedDelegates[msg.sender]) {
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

    /// @notice Approve a delegate contract (e.g., DemoIssuer) to issue credentials
    function approveDelegate(address delegate) external onlyOwner {
        approvedDelegates[delegate] = true;
        emit DelegateApproved(delegate);
    }

    /// @notice Revoke a delegate's approval
    function revokeDelegate(address delegate) external onlyOwner {
        approvedDelegates[delegate] = false;
        emit DelegateRevoked(delegate);
    }

    /// @notice Create a new credential group linked to a schema
    /// @param name Human-readable name for the credential type
    /// @param schemaHash The schema hash from CredentialRegistry (bytes32(0) if no schema)
    /// @return groupId The Semaphore group ID created
    function createCredentialGroup(string calldata name, bytes32 schemaHash) external onlyApprovedIssuer returns (uint256 groupId) {
        groupId = semaphore.createGroup(address(this));

        credentialGroups[groupId] = CredentialGroup({
            name: name,
            groupId: groupId,
            issuer: msg.sender,
            memberCount: 0,
            active: true,
            schemaHash: schemaHash
        });

        groupIds.push(groupId);
        emit CredentialGroupCreated(groupId, name, msg.sender, schemaHash);
    }

    /// @notice Create a new credential group without schema (backwards compatible)
    function createCredentialGroup(string calldata name) external onlyApprovedIssuer returns (uint256 groupId) {
        groupId = semaphore.createGroup(address(this));

        credentialGroups[groupId] = CredentialGroup({
            name: name,
            groupId: groupId,
            issuer: msg.sender,
            memberCount: 0,
            active: true,
            schemaHash: bytes32(0)
        });

        groupIds.push(groupId);
        emit CredentialGroupCreated(groupId, name, msg.sender, bytes32(0));
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
    function verifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool) {
        if (!credentialGroups[groupId].active) revert GroupNotActive();
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

    /// @notice Deactivate a credential group
    function deactivateGroup(uint256 groupId) external onlyGroupIssuerOrDelegate(groupId) {
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

    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
