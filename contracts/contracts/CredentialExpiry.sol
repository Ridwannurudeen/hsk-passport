// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

/// @title CredentialExpiry — On-chain expiry tracking for HSK Passport credentials
/// @notice Layers on top of HSKPassport to enforce time-bounded credentials.
///         Issuers call markIssued() alongside HSKPassport.issueCredential() to record timestamp.
///         dApps call isValid() or verifyWithExpiry() to check both validity and expiry.
/// @dev Decoupled from HSKPassport core so existing credentials remain unaffected.
///      Per-group validity period (in seconds). 0 = never expires.
contract CredentialExpiry {
    address public owner;
    address public hskPassport;

    /// @dev groupId => validity period in seconds (0 = never expires)
    mapping(uint256 => uint256) public validityPeriod;

    /// @dev groupId => identityCommitment => issuance timestamp
    mapping(uint256 => mapping(uint256 => uint256)) public issuedAt;

    /// @dev addresses authorized to call markIssued (e.g., HSKPassport issuers, DemoIssuer, HashKeyDIDBridge)
    mapping(address => bool) public authorized;

    event ValidityPeriodSet(uint256 indexed groupId, uint256 period);
    event IssuanceRecorded(uint256 indexed groupId, uint256 indexed identityCommitment, uint256 timestamp);
    event AuthorizedAdded(address indexed addr);
    event AuthorizedRemoved(address indexed addr);

    error NotOwner();
    error NotAuthorized();
    error AlreadyRecorded();
    error NotRecorded();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAuthorized() {
        if (!authorized[msg.sender] && msg.sender != owner) revert NotAuthorized();
        _;
    }

    constructor(address _hskPassport) {
        owner = msg.sender;
        hskPassport = _hskPassport;
        authorized[msg.sender] = true;
    }

    /// @notice Set validity period for a credential group
    /// @param groupId Credential group
    /// @param period Seconds before credentials expire (0 = never)
    function setValidityPeriod(uint256 groupId, uint256 period) external onlyOwner {
        validityPeriod[groupId] = period;
        emit ValidityPeriodSet(groupId, period);
    }

    /// @notice Authorize a contract/address to record issuances
    function addAuthorized(address addr) external onlyOwner {
        authorized[addr] = true;
        emit AuthorizedAdded(addr);
    }

    function removeAuthorized(address addr) external onlyOwner {
        authorized[addr] = false;
        emit AuthorizedRemoved(addr);
    }

    /// @notice Record that a credential was issued (call alongside HSKPassport.issueCredential)
    /// @param groupId Credential group
    /// @param identityCommitment User's identity commitment
    function markIssued(uint256 groupId, uint256 identityCommitment) external onlyAuthorized {
        if (issuedAt[groupId][identityCommitment] != 0) revert AlreadyRecorded();
        issuedAt[groupId][identityCommitment] = block.timestamp;
        emit IssuanceRecorded(groupId, identityCommitment, block.timestamp);
    }

    /// @notice Check if a credential has expired
    /// @param groupId Credential group
    /// @param identityCommitment User's identity commitment
    /// @return True if expired (expired credentials should fail verification)
    function isExpired(uint256 groupId, uint256 identityCommitment) external view returns (bool) {
        uint256 issued = issuedAt[groupId][identityCommitment];
        if (issued == 0) return false; // not recorded — treat as valid (legacy credentials)
        uint256 period = validityPeriod[groupId];
        if (period == 0) return false; // no expiry configured
        return block.timestamp > issued + period;
    }

    /// @notice Get expiry timestamp (0 = no expiry)
    function expiresAt(uint256 groupId, uint256 identityCommitment) external view returns (uint256) {
        uint256 issued = issuedAt[groupId][identityCommitment];
        if (issued == 0) return 0;
        uint256 period = validityPeriod[groupId];
        if (period == 0) return 0;
        return issued + period;
    }

    /// @notice Seconds remaining until expiry (0 if expired or no expiry)
    function timeUntilExpiry(uint256 groupId, uint256 identityCommitment) external view returns (uint256) {
        uint256 issued = issuedAt[groupId][identityCommitment];
        if (issued == 0) return 0;
        uint256 period = validityPeriod[groupId];
        if (period == 0) return 0;
        uint256 deadline = issued + period;
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
