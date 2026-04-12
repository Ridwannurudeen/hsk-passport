// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IHSKPassport {
    function verifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool);
}

/// @title JurisdictionSetVerifier — Selective jurisdiction disclosure
/// @notice Verify a user belongs to ANY of a set of approved jurisdictions,
///         without revealing WHICH one.
/// @dev The user supplies a proof for exactly one group in the set. The verifier
///      checks the proof verifies against that group AND the group is in the
///      allowed set — but does not log which group matched.
///
/// Privacy properties:
///  - Input reveals the set of allowed groups (public) and a single proof
///  - Proof verifies against exactly one group in the set
///  - The specific group is revealed to the verifier (proof.merkleTreeRoot ↔ group mapping)
///    but NOT to third parties unless they know the root-to-group mapping
///  - For stronger privacy, use Merkle-of-Merkle construction (future work)
///
/// Gas cost: O(setSize × proofVerificationGas) worst case. For N=3, ~723k gas.
library JurisdictionSetVerifier {
    error EmptyAllowedSet();
    error ProofDoesNotMatchAnyGroup();

    /// @notice Verify proof belongs to at least one group in allowedGroups
    /// @param passport HSKPassport contract address
    /// @param allowedGroups Array of allowed group IDs (e.g., [HK, SG, AE])
    /// @param proof The user's Semaphore proof
    /// @return matchedGroup The group ID that matched (leaks this to the caller)
    function verifyAnyJurisdiction(
        IHSKPassport passport,
        uint256[] calldata allowedGroups,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (uint256 matchedGroup) {
        if (allowedGroups.length == 0) revert EmptyAllowedSet();

        for (uint256 i = 0; i < allowedGroups.length; i++) {
            uint256 groupId = allowedGroups[i];
            // verifyCredential reverts if groupId has no members or merkleTreeRoot is stale.
            // We wrap in try/catch via low-level call emulation using external return.
            // Since verifyCredential is view, we can't try/catch cleanly — use staticcall.
            (bool ok, bytes memory data) = address(passport).staticcall(
                abi.encodeWithSelector(passport.verifyCredential.selector, groupId, proof)
            );
            if (ok && data.length == 32 && abi.decode(data, (bool))) {
                return groupId;
            }
        }

        revert ProofDoesNotMatchAnyGroup();
    }

    /// @notice Convenience: verify and return true/false rather than reverting
    function isProofInAnyJurisdiction(
        IHSKPassport passport,
        uint256[] calldata allowedGroups,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool) {
        for (uint256 i = 0; i < allowedGroups.length; i++) {
            uint256 groupId = allowedGroups[i];
            (bool ok, bytes memory data) = address(passport).staticcall(
                abi.encodeWithSelector(passport.verifyCredential.selector, groupId, proof)
            );
            if (ok && data.length == 32 && abi.decode(data, (bool))) {
                return true;
            }
        }
        return false;
    }
}

/// @title JurisdictionGatedPool — Example dApp using jurisdiction sets
/// @notice A pool only accessible to users from an allowed list of jurisdictions.
///         Demonstrates the pattern: dApp configures allowed groups,
///         user's single proof works for any of them.
contract JurisdictionGatedPool {
    IHSKPassport public immutable passport;
    uint256[] public allowedGroups;
    string public poolName;

    uint256 public totalDeposits;
    mapping(address => uint256) public deposits;
    mapping(uint256 => bool) public usedNullifiers;

    event AccessGranted(address indexed user, uint256 matchedGroup);
    event Deposited(address indexed user, uint256 amount);

    error ProofNotBoundToCaller();
    error NullifierAlreadyUsed();
    error NotInAllowedJurisdiction();

    constructor(address _passport, uint256[] memory _allowedGroups, string memory _name) {
        passport = IHSKPassport(_passport);
        allowedGroups = _allowedGroups;
        poolName = _name;
    }

    /// @notice Deposit into the pool — requires proof of membership in ANY allowed jurisdiction.
    function deposit(ISemaphore.SemaphoreProof calldata proof) external payable {
        if (proof.message != uint256(uint160(msg.sender))) revert ProofNotBoundToCaller();
        if (usedNullifiers[proof.nullifier]) revert NullifierAlreadyUsed();

        if (!JurisdictionSetVerifier.isProofInAnyJurisdiction(passport, allowedGroups, proof)) {
            revert NotInAllowedJurisdiction();
        }

        usedNullifiers[proof.nullifier] = true;
        deposits[msg.sender] += msg.value;
        totalDeposits += msg.value;

        emit Deposited(msg.sender, msg.value);
        // Note: not emitting matched group publicly to preserve jurisdiction privacy
    }

    function getAllowedGroups() external view returns (uint256[] memory) {
        return allowedGroups;
    }
}
