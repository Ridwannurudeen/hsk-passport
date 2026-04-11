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

    constructor(address _passport) {
        passport = IHSKPassport(_passport);
    }

    /// @notice Require the caller to hold a valid credential for the given group
    /// @dev Read-only verification — does not consume the nullifier
    modifier onlyCredentialHolder(uint256 groupId, ISemaphore.SemaphoreProof calldata proof) {
        if (!passport.verifyCredential(groupId, proof)) revert InvalidCredential();
        _;
    }

    /// @notice Require and consume a credential proof (prevents reuse for same scope)
    /// @dev Writes to chain — consumes the nullifier
    modifier onlyCredentialHolderOnce(uint256 groupId, ISemaphore.SemaphoreProof calldata proof) {
        passport.validateCredential(groupId, proof);
        _;
    }
}
