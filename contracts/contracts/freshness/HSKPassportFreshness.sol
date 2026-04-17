// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {FreshnessRegistry} from "./FreshnessRegistry.sol";
import {IFreshnessVerifier} from "./IFreshnessVerifier.sol";

/// @title HSKPassportFreshness — Per-prover ZK expiry verification
/// @notice Composes a FreshnessRegistry (Merkle-root history) and a Groth16 verifier to let
///         dApps check that a caller holds a credential issued within a dApp-chosen freshness
///         window, WITHOUT revealing the identity commitment or the exact issuance time.
/// @dev This is the on-chain integration layer that moves HSK Passport's credential expiry from
///      "group-window check" (HSKPassport.verifyCredentialWithExpiry) to a real per-prover ZK
///      range proof. The existing HSKPassport contract is untouched; dApps opt in by calling
///      `verifyFresh` here instead of / in addition to the legacy path.
contract HSKPassportFreshness {
    FreshnessRegistry public immutable registry;
    IFreshnessVerifier public immutable verifier;

    /// @dev scope => nullifier => consumed? (enforces one proof per scope per credential)
    mapping(uint256 => mapping(uint256 => bool)) public nullifierConsumed;

    event FreshnessProofVerified(
        uint256 indexed groupId,
        uint256 indexed scope,
        uint256 indexed nullifier,
        uint256 earliestAcceptable
    );

    error UnknownRoot();
    error NullifierAlreadyUsed();
    error InvalidProof();
    error CallerNotBoundToScope();

    constructor(FreshnessRegistry _registry, IFreshnessVerifier _verifier) {
        registry = _registry;
        verifier = _verifier;
    }

    /// @notice Verify a freshness proof AND mark the nullifier consumed.
    /// @param groupId            Credential group id matching the registry
    /// @param merkleRoot         Root the proof was generated against (must be in registry history)
    /// @param earliestAcceptable dApp-chosen freshness threshold (unix seconds); proofs assert
    ///                           issuanceTime >= this value
    /// @param scope              Per-dApp / per-action nullifier scope; caller typically sets this
    ///                           to `uint256(uint160(address(this)))` or hashes an action string
    /// @param nullifier          Output of the ZK circuit; prevents replay within the scope
    /// @param proofA             Groth16 point A
    /// @param proofB             Groth16 point B
    /// @param proofC             Groth16 point C
    /// @dev Caller-binding is preserved by requiring `scope` to be derived from `msg.sender` at
    ///      the dApp layer (same pattern as HSKPassport.verifyCredential). The contract itself
    ///      does not reference `msg.sender` directly — the binding happens via scope construction.
    function verifyFresh(
        uint256 groupId,
        uint256 merkleRoot,
        uint256 earliestAcceptable,
        uint256 scope,
        uint256 nullifier,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) external {
        if (!registry.isKnownRoot(groupId, merkleRoot)) revert UnknownRoot();
        if (nullifierConsumed[scope][nullifier]) revert NullifierAlreadyUsed();

        uint256[4] memory publicSignals;
        publicSignals[0] = nullifier;
        publicSignals[1] = merkleRoot;
        publicSignals[2] = earliestAcceptable;
        publicSignals[3] = scope;

        if (!verifier.verifyProof(proofA, proofB, proofC, publicSignals)) revert InvalidProof();

        nullifierConsumed[scope][nullifier] = true;
        emit FreshnessProofVerified(groupId, scope, nullifier, earliestAcceptable);
    }

    /// @notice Read-only proof verification; does NOT mark the nullifier consumed.
    /// @dev Use this for UX previews (e.g. "is my proof still valid?"). Production verification
    ///      paths should call `verifyFresh` so replay protection is enforced.
    function previewVerifyFresh(
        uint256 groupId,
        uint256 merkleRoot,
        uint256 earliestAcceptable,
        uint256 scope,
        uint256 nullifier,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) external view returns (bool) {
        if (!registry.isKnownRoot(groupId, merkleRoot)) return false;
        if (nullifierConsumed[scope][nullifier]) return false;

        uint256[4] memory publicSignals;
        publicSignals[0] = nullifier;
        publicSignals[1] = merkleRoot;
        publicSignals[2] = earliestAcceptable;
        publicSignals[3] = scope;

        return verifier.verifyProof(proofA, proofB, proofC, publicSignals);
    }
}
