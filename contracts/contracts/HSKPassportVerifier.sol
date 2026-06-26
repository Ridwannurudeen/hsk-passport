// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// @title IHSKPassport — Interface for HSK Passport credential verification
interface IHSKPassport {
    function verifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool);

    function validateCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external;
}

/// @title HSKPassportVerifier — Base contract for dApps requiring ZK credential verification
/// @notice Inherit this contract and use the modifier to gate any function behind a KYC proof.
/// @dev Works like OpenZeppelin's Ownable — one import, one modifier, done.
///
/// Usage:
///   contract MyDApp is HSKPassportVerifier {
///       uint256 constant KYC_GROUP = 0;
///
///       constructor(address passport) HSKPassportVerifier(passport) {}
///
///       function restrictedAction(
///           ISemaphore.SemaphoreProof calldata proof
///       ) external onlyCredentialHolder(KYC_GROUP, proof) {
///           // Only KYC-verified users reach here
///       }
///   }
abstract contract HSKPassportVerifier {
    IHSKPassport public immutable passport;

    error InvalidCredential();
    error WrongScope();

    constructor(address _passport) {
        passport = IHSKPassport(_passport);
    }

    /// @notice Require the caller to hold a valid credential for the given group
    /// @dev Read-only verification — does not consume the nullifier. The proof MUST
    ///      be bound to the caller (`proof.message == uint256(uint160(msg.sender))`),
    ///      otherwise an observer could lift a valid proof out of historical calldata
    ///      and replay it to pass the gate as themselves.
    modifier onlyCredentialHolder(uint256 groupId, ISemaphore.SemaphoreProof calldata proof) {
        if (proof.message != uint256(uint160(msg.sender))) revert InvalidCredential();
        if (!passport.verifyCredential(groupId, proof)) revert InvalidCredential();
        _;
    }

    /// @notice Require and consume a credential proof — once per identity per dApp.
    /// @dev Writes to chain — consumes the nullifier. Two bindings are enforced:
    ///      (1) caller-binding (`proof.message == msg.sender`) so a copied proof cannot be
    ///      front-run, and (2) scope-binding (`proof.scope == uint256(uint160(address(this)))`)
    ///      so the one-time guarantee cannot be bypassed by re-proving under a fresh scope —
    ///      the Semaphore nullifier is hash(scope, secret). Generate the proof with the
    ///      inheriting dApp's own address as the scope. Note: every `onlyCredentialHolderOnce`
    ///      function on a dApp shares this scope, so an identity acts once per dApp.
    modifier onlyCredentialHolderOnce(uint256 groupId, ISemaphore.SemaphoreProof calldata proof) {
        if (proof.message != uint256(uint160(msg.sender))) revert InvalidCredential();
        if (proof.scope != uint256(uint160(address(this)))) revert WrongScope();
        passport.validateCredential(groupId, proof);
        _;
    }
}
