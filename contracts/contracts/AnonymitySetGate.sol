// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IHSKPassport {
    function credentialGroups(uint256)
        external
        view
        returns (
            string memory name,
            uint256 groupId,
            address issuer,
            uint256 memberCount,
            bool active,
            bytes32 schemaHash,
            uint256 validityPeriod
        );
    function verifyCredential(uint256 groupId, ISemaphore.SemaphoreProof calldata proof)
        external
        view
        returns (bool);
    function verifyCredentialWithExpiry(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof,
        uint256 earliestAcceptableIssuance
    ) external view returns (bool);
}

interface IFreshnessRegistry {
    function leafCount(uint256 groupId) external view returns (uint256);
}

interface IHSKPassportFreshness {
    function previewVerifyFresh(
        uint256 groupId,
        uint256 merkleRoot,
        uint256 earliestAcceptable,
        uint256 scope,
        uint256 nullifier,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) external view returns (bool);
    /// @dev Consuming verification: reverts on an invalid or already-used proof and
    ///      marks the (scope, nullifier) consumed. The gate uses this, NOT the preview.
    function verifyFresh(
        uint256 groupId,
        uint256 merkleRoot,
        uint256 earliestAcceptable,
        uint256 scope,
        uint256 nullifier,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) external;
}

/// @title AnonymitySetGate — Opt-in floor + warning for credential anonymity-set sizes
/// @notice dApps that want stronger privacy guarantees wrap their verifyCredential or
///         verifyFresh call through this gate. The gate reverts when the anonymity set
///         is below a dApp-supplied floor (default 1000), and emits a soft warning
///         event when the set is below 10,000 — enough for monitors to alert before
///         the floor is hit.
///
/// @dev Non-breaking: existing dApps continue to call HSKPassport / HSKPassportFreshness
///      directly. New dApps integrate via this gate. The gate makes one extra view call
///      to read group size, then delegates the actual proof verify to the underlying
///      contract — verification semantics are unchanged.
contract AnonymitySetGate {
    /// @notice Soft-warning threshold. Below this size, observers should regard the
    ///         anonymity set as marginal even though proofs still verify.
    uint256 public constant WARN_BELOW_MEMBERS = 10_000;

    /// @notice Default hard floor when a dApp passes minMembers = 0. Picked to match
    ///         the v6 roadmap: "reject below 1000". dApps that prefer a different floor
    ///         pass it explicitly.
    uint256 public constant DEFAULT_MIN_MEMBERS = 1_000;

    event LowAnonymitySet(uint256 indexed groupId, uint256 size, uint256 threshold);

    error AnonymitySetTooSmall(uint256 groupId, uint256 size, uint256 minMembers);

    function _resolveMin(uint256 minMembers) private pure returns (uint256) {
        return minMembers == 0 ? DEFAULT_MIN_MEMBERS : minMembers;
    }

    /// @notice Verify a Semaphore credential proof, gated on a minimum group size.
    /// @dev Reverts if `passport.credentialGroups(groupId).memberCount < minMembers`.
    ///      Emits LowAnonymitySet when the size is in [minMembers, WARN_BELOW_MEMBERS).
    function verifyCredentialWithFloor(
        IHSKPassport passport,
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof,
        uint256 minMembers
    ) external returns (bool) {
        uint256 floor = _resolveMin(minMembers);
        (, , , uint256 size, , , ) = passport.credentialGroups(groupId);
        if (size < floor) revert AnonymitySetTooSmall(groupId, size, floor);
        if (size < WARN_BELOW_MEMBERS) emit LowAnonymitySet(groupId, size, WARN_BELOW_MEMBERS);
        return passport.verifyCredential(groupId, proof);
    }

    /// @notice Variant that also enforces credential-group expiry. Mirrors the
    ///         `verifyCredentialWithExpiry` shape on HSKPassport.
    function verifyCredentialWithExpiryAndFloor(
        IHSKPassport passport,
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof,
        uint256 earliestAcceptableIssuance,
        uint256 minMembers
    ) external returns (bool) {
        uint256 floor = _resolveMin(minMembers);
        (, , , uint256 size, , , ) = passport.credentialGroups(groupId);
        if (size < floor) revert AnonymitySetTooSmall(groupId, size, floor);
        if (size < WARN_BELOW_MEMBERS) emit LowAnonymitySet(groupId, size, WARN_BELOW_MEMBERS);
        return passport.verifyCredentialWithExpiry(groupId, proof, earliestAcceptableIssuance);
    }

    /// @notice Verify a v6 freshness proof, gated on the FreshnessRegistry leaf count
    ///         for the same group. The freshness anonymity set is the number of leaves
    ///         the registry has accepted for that group, which is the same set the
    ///         circuit's Merkle inclusion runs over.
    /// @dev Routes through the CONSUMING `verifyFresh` so the (scope, nullifier) is marked
    ///      used — a freshness proof cannot be replayed. Reverts on an invalid or already-used
    ///      proof; returns true only on a fresh, valid verification.
    function verifyFreshWithFloor(
        IHSKPassportFreshness composer,
        IFreshnessRegistry registry,
        uint256 groupId,
        uint256 merkleRoot,
        uint256 earliestAcceptable,
        uint256 scope,
        uint256 nullifier,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC,
        uint256 minMembers
    ) external returns (bool) {
        uint256 floor = _resolveMin(minMembers);
        uint256 size = registry.leafCount(groupId);
        if (size < floor) revert AnonymitySetTooSmall(groupId, size, floor);
        if (size < WARN_BELOW_MEMBERS) emit LowAnonymitySet(groupId, size, WARN_BELOW_MEMBERS);
        composer.verifyFresh(
            groupId,
            merkleRoot,
            earliestAcceptable,
            scope,
            nullifier,
            proofA,
            proofB,
            proofC
        );
        return true;
    }

    /// @notice Pure-read variant — returns (size, hardOk, soft) without emitting or
    ///         reverting. Useful for dApp UIs that want to surface anonymity size
    ///         before submitting the verify call, or for off-chain monitors.
    function inspect(
        IHSKPassport passport,
        uint256 groupId,
        uint256 minMembers
    ) external view returns (uint256 size, bool hardOk, bool soft) {
        (, , , size, , , ) = passport.credentialGroups(groupId);
        hardOk = size >= _resolveMin(minMembers);
        soft = size < WARN_BELOW_MEMBERS;
    }

    function inspectFreshness(
        IFreshnessRegistry registry,
        uint256 groupId,
        uint256 minMembers
    ) external view returns (uint256 size, bool hardOk, bool soft) {
        size = registry.leafCount(groupId);
        hardOk = size >= _resolveMin(minMembers);
        soft = size < WARN_BELOW_MEMBERS;
    }
}
