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
/// @dev !!! AUDIT FINDING (April 2026): verifyReputationThreshold does NOT cryptographically
///      bind the caller's ZK proof to the identityCommitment being checked. Any member of the
///      group can present someone else's high-reputation commitment and pass.
///      Additionally, revealing the commitment breaks the privacy claim.
///
///      DO NOT use verifyReputationThreshold in production. The correct design requires a
///      dedicated circuit that proves knowledge of the identity secret AND that its commitment
///      has reputation >= threshold, WITHOUT revealing which commitment. This is on the
///      Q3 2026 roadmap pending circuit work.
///
///      For now this contract is deployed for tracking/analytics only. Reputation scores are
///      public on-chain data; no private threshold proof is currently supported.
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
    error InsufficientReputation();
    error InvalidProof();
    error ThresholdNotEncoded();

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

    /// @notice Prove a user's reputation is ≥ threshold, without revealing the identity.
    /// @dev The proof must prove membership in `groupId` with message = threshold.
    ///      The caller (dApp) must have pre-verified the reputation, then submitted this proof
    ///      to bind it to the action. Used alongside getReputation() in integration flows.
    /// @param groupId The credential group the user is proving membership in
    /// @param threshold Minimum reputation required (encoded as proof.message for ZK binding)
    /// @param identityCommitment User's commitment (looked up separately — NOT revealed in proof)
    /// @param proof Semaphore proof proving group membership + threshold encoding
    function verifyReputationThreshold(
        uint256 groupId,
        uint256 threshold,
        uint256 identityCommitment,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool) {
        // The message must encode the threshold being claimed
        if (proof.message != threshold) revert ThresholdNotEncoded();
        // User must have at least threshold reputation
        if (reputationOf[identityCommitment] < threshold) revert InsufficientReputation();
        // Proof must verify against the claimed group
        if (!passport.verifyCredential(groupId, proof)) revert InvalidProof();
        return true;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
