// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

/// @title FreshnessRegistry — Per-group Merkle root history for freshness-ZK proofs
/// @notice Authorized issuers maintain a Merkle tree of Poseidon(identityCommitment, issuanceTime)
///         leaves off-chain. On each issuance they push the new root on-chain. The registry keeps
///         a rolling window of accepted roots so in-flight proofs don't get invalidated the instant
///         a new credential is issued.
/// @dev Trust model: issuers are already regulated entities authorized by the HSK Passport owner /
///      Timelock. A malicious issuer can submit any root for their own group, but cannot forge
///      roots for other groups. Users always verify via a proof — a bogus root accepts NO valid
///      proofs because the prover can't fabricate a valid Merkle path.
contract FreshnessRegistry {
    /// @dev How many historical roots remain accepted per group. Tunable per deployment.
    ///      100 × 15s per block ≈ 25 minutes of in-flight proof tolerance, which is plenty
    ///      for browser proof generation + user action.
    uint256 public constant ROOT_HISTORY_SIZE = 100;

    address public owner;
    address public pendingOwner;

    /// @dev groupId => true if authorized issuer can write leaves/roots to this group
    mapping(uint256 => mapping(address => bool)) public groupIssuer;

    /// @dev groupId => current root
    mapping(uint256 => uint256) public currentRoot;

    /// @dev groupId => ring-buffer of past roots (index [0, ROOT_HISTORY_SIZE))
    mapping(uint256 => uint256[ROOT_HISTORY_SIZE]) private _rootBuffer;

    /// @dev groupId => next write index into _rootBuffer[groupId]
    mapping(uint256 => uint256) private _rootBufferIndex;

    /// @dev groupId => monotonically-increasing leaf count (for transparency / indexing)
    mapping(uint256 => uint256) public leafCount;

    event IssuerAuthorized(uint256 indexed groupId, address indexed issuer);
    event IssuerRevoked(uint256 indexed groupId, address indexed issuer);
    event LeafAdded(uint256 indexed groupId, uint256 indexed leaf, uint256 newRoot, uint256 indexed index);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotPendingOwner();
    error NotAuthorized();
    error InvalidRoot();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyIssuer(uint256 groupId) {
        if (!groupIssuer[groupId][msg.sender]) revert NotAuthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // -------------------------------------------------------------------------
    // Owner controls
    // -------------------------------------------------------------------------

    function authorizeIssuer(uint256 groupId, address issuer) external onlyOwner {
        groupIssuer[groupId][issuer] = true;
        emit IssuerAuthorized(groupId, issuer);
    }

    function revokeIssuer(uint256 groupId, address issuer) external onlyOwner {
        groupIssuer[groupId][issuer] = false;
        emit IssuerRevoked(groupId, issuer);
    }

    /// @notice Two-step ownership transfer. New owner must call `acceptOwnership`.
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Issuer writes
    // -------------------------------------------------------------------------

    /// @notice Record a new leaf and update the group root.
    /// @param groupId Credential group id (same namespace as HSKPassport group ids)
    /// @param leaf    Poseidon(identityCommitment, issuanceTime) — issuer computes off-chain
    /// @param newRoot Merkle root after inserting `leaf` at position `leafCount[groupId]`
    /// @dev The registry does NOT verify `newRoot` was correctly derived from `leaf` + the
    ///      previous root — it trusts the authorized issuer. A malicious issuer can post bogus
    ///      roots, but no valid ZK proof can be generated against a bogus root, so bad behaviour
    ///      is self-defeating (and publicly detectable by re-running the Merkle computation).
    function addLeaf(uint256 groupId, uint256 leaf, uint256 newRoot) external onlyIssuer(groupId) {
        if (newRoot == 0) revert InvalidRoot();

        uint256 idx = _rootBufferIndex[groupId];
        _rootBuffer[groupId][idx] = newRoot;
        _rootBufferIndex[groupId] = (idx + 1) % ROOT_HISTORY_SIZE;

        currentRoot[groupId] = newRoot;
        uint256 prevCount = leafCount[groupId];
        leafCount[groupId] = prevCount + 1;

        emit LeafAdded(groupId, leaf, newRoot, prevCount);
    }

    // -------------------------------------------------------------------------
    // Read helpers
    // -------------------------------------------------------------------------

    /// @notice Check whether a given root is in the rolling-window history for a group.
    function isKnownRoot(uint256 groupId, uint256 root) public view returns (bool) {
        if (root == 0) return false;
        if (root == currentRoot[groupId]) return true;
        uint256[ROOT_HISTORY_SIZE] storage buf = _rootBuffer[groupId];
        for (uint256 i = 0; i < ROOT_HISTORY_SIZE; i++) {
            if (buf[i] == root) return true;
        }
        return false;
    }
}
