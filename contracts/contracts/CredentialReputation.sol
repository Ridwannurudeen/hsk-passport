// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IHSKPassport {
    function verifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool);
}

/// @title CredentialReputation — ROADMAP FEATURE, NOT PRODUCTION-READY
/// @notice Cross-credential reputation scoring. Tracks on-chain reputation per identity commitment.
/// @dev Reputation scores are public on-chain data and advisory only; nothing here gates access.
///      The former `verifyReputationThreshold` was REMOVED (audit finding): it did not
///      cryptographically bind the ZK proof to the identityCommitment, so any member of the
///      group could present another user's high-reputation commitment and pass, and revealing
///      the commitment broke the privacy claim. A private threshold proof requires a dedicated
///      circuit (prove knowledge of the identity secret AND reputation >= threshold WITHOUT
///      revealing which commitment) — Q3 2026 roadmap pending circuit work.
contract CredentialReputation {
    IHSKPassport public immutable passport;
    address public owner;

    /// @dev groupId => reputation points granted per credential in this group
    mapping(uint256 => uint256) public pointsPerGroup;

    /// @dev identityCommitment => total reputation score
    mapping(uint256 => uint256) public reputationOf;

    /// @dev identityCommitment => groupId => whether points already awarded (prevents double-counting)
    mapping(uint256 => mapping(uint256 => bool)) public awarded;

    /// @dev authorized contracts that can report issuances (HSKPassport issuers, bridges, etc.)
    mapping(address => bool) public reporters;

    /// @dev tier thresholds (sorted ascending). tier[i] = min reputation for tier i.
    /// Tiers: 0=Unverified, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum
    uint256[5] public tierThresholds;

    event PointsConfigured(uint256 indexed groupId, uint256 points);
    event ReputationGained(uint256 indexed identityCommitment, uint256 indexed groupId, uint256 points, uint256 newTotal);
    event ReputationBurned(uint256 indexed identityCommitment, uint256 points, uint256 newTotal);
    event ReporterAdded(address indexed reporter);
    event ReporterRemoved(address indexed reporter);
    event TierThresholdsUpdated(uint256[5] thresholds);

    error NotOwner();
    error NotReporter();
    error AlreadyAwarded();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyReporter() {
        if (!reporters[msg.sender] && msg.sender != owner) revert NotReporter();
        _;
    }

    constructor(address _passport) {
        passport = IHSKPassport(_passport);
        owner = msg.sender;
        reporters[msg.sender] = true;
        // Default tiers: Bronze=10, Silver=50, Gold=200, Platinum=1000
        tierThresholds = [0, 10, 50, 200, 1000];
    }

    /// @notice Configure how many reputation points a credential in a group is worth
    function setPointsPerGroup(uint256 groupId, uint256 points) external onlyOwner {
        pointsPerGroup[groupId] = points;
        emit PointsConfigured(groupId, points);
    }

    /// @notice Authorize a reporter (HSKPassport, DemoIssuer, bridges, etc.) to record issuances
    function addReporter(address addr) external onlyOwner {
        reporters[addr] = true;
        emit ReporterAdded(addr);
    }

    function removeReporter(address addr) external onlyOwner {
        reporters[addr] = false;
        emit ReporterRemoved(addr);
    }

    /// @notice Update tier thresholds
    function setTierThresholds(uint256[5] calldata thresholds) external onlyOwner {
        tierThresholds = thresholds;
        emit TierThresholdsUpdated(thresholds);
    }

    /// @notice Record a credential issuance and award reputation points.
    ///         Called by HSKPassport issuers alongside issueCredential().
    /// @param identityCommitment User's identity commitment
    /// @param groupId Credential group
    function recordIssuance(uint256 identityCommitment, uint256 groupId) external onlyReporter {
        if (awarded[identityCommitment][groupId]) revert AlreadyAwarded();
        uint256 points = pointsPerGroup[groupId];
        if (points == 0) return;

        awarded[identityCommitment][groupId] = true;
        reputationOf[identityCommitment] += points;
        emit ReputationGained(identityCommitment, groupId, points, reputationOf[identityCommitment]);
    }

    /// @notice Record revocation and burn reputation
    function recordRevocation(uint256 identityCommitment, uint256 groupId) external onlyReporter {
        if (!awarded[identityCommitment][groupId]) return;
        uint256 points = pointsPerGroup[groupId];
        awarded[identityCommitment][groupId] = false;
        if (reputationOf[identityCommitment] >= points) {
            reputationOf[identityCommitment] -= points;
        } else {
            reputationOf[identityCommitment] = 0;
        }
        emit ReputationBurned(identityCommitment, points, reputationOf[identityCommitment]);
    }

    /// @notice Get tier for a given reputation score
    function getTier(uint256 reputation) public view returns (uint8) {
        for (uint8 i = uint8(tierThresholds.length); i > 0; i--) {
            if (reputation >= tierThresholds[i - 1]) return i - 1;
        }
        return 0;
    }

    /// @notice Get tier of a user by identity commitment
    function tierOf(uint256 identityCommitment) external view returns (uint8) {
        return getTier(reputationOf[identityCommitment]);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
