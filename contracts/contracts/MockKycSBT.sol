// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

/// @title MockKycSBT — reference implementation of HashKey Chain's IKycSBT interface
/// @notice Implements the exact interface published at
///         https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/KYC
///         so HashKeyKycSBTAdapter + HashKeyKYCImporter can be tested end-to-end
///         against a real on-chain contract before the live HashKey IKycSBT
///         address is available. The owner can set KYC levels for any address.
contract MockKycSBT {
    enum KycLevel { NONE, BASIC, ADVANCED, PREMIUM, ULTIMATE }
    enum KycStatus { NONE, APPROVED, REVOKED }

    struct KycRecord {
        string ensName;
        KycLevel level;
        KycStatus status;
        uint256 createTime;
    }

    address public owner;
    mapping(address => KycRecord) private records;

    event KycRequested(address indexed user, string ensName);
    event KycLevelUpdated(address indexed user, KycLevel level);
    event KycStatusUpdated(address indexed user, KycStatus status);
    event KycRevoked(address indexed user);
    event KycRestored(address indexed user);

    error NotOwner();
    error NotRequested();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice User (or a test runner) requests KYC with an ENS name.
    /// @dev In production, payable fee is enforced. Here 0 is allowed for test convenience.
    function requestKyc(string calldata ensName) external payable {
        KycRecord storage r = records[msg.sender];
        if (r.createTime == 0) {
            r.createTime = block.timestamp;
        }
        r.ensName = ensName;
        emit KycRequested(msg.sender, ensName);
    }

    /// @notice Owner (simulating the official attester) approves a user at a given level.
    function approve(address user, KycLevel level) external onlyOwner {
        KycRecord storage r = records[user];
        if (r.createTime == 0) revert NotRequested();
        r.level = level;
        r.status = KycStatus.APPROVED;
        emit KycLevelUpdated(user, level);
        emit KycStatusUpdated(user, KycStatus.APPROVED);
    }

    function revokeKyc(address user) external onlyOwner {
        records[user].status = KycStatus.REVOKED;
        emit KycRevoked(user);
    }

    function restoreKyc(address user) external onlyOwner {
        records[user].status = KycStatus.APPROVED;
        emit KycRestored(user);
    }

    function isHuman(address account) external view returns (bool, uint8) {
        KycRecord storage r = records[account];
        bool isApproved = r.status == KycStatus.APPROVED && r.level != KycLevel.NONE;
        return (isApproved, uint8(r.level));
    }

    function getKycInfo(address account)
        external
        view
        returns (
            string memory ensName,
            KycLevel level,
            KycStatus status,
            uint256 createTime
        )
    {
        KycRecord storage r = records[account];
        return (r.ensName, r.level, r.status, r.createTime);
    }
}
