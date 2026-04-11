// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// @title IHSKPassportIssuer — Minimal interface for credential issuance
interface IHSKPassportIssuer {
    function issueCredential(uint256 groupId, uint256 identityCommitment) external;
    function hasCredential(uint256 groupId, uint256 identityCommitment) external view returns (bool);
}

/// @title DemoIssuer — Self-service credential issuance for hackathon demos
/// @notice Allows anyone to issue themselves a KYC_VERIFIED credential for testing.
/// @dev In production, issuance would require off-chain KYC verification by a trusted issuer.
///      This contract exists to let judges and testers try the full flow without an issuer.
contract DemoIssuer {
    IHSKPassportIssuer public immutable passport;
    uint256 public immutable kycGroupId;

    mapping(address => bool) public claimed;
    uint256 public totalIssued;

    event DemoCredentialIssued(address indexed claimer, uint256 identityCommitment);

    error AlreadyClaimed();
    error ZeroCommitment();

    /// @param _passport Address of the HSKPassport contract
    /// @param _kycGroupId The group ID for KYC_VERIFIED credentials
    constructor(address _passport, uint256 _kycGroupId) {
        passport = IHSKPassportIssuer(_passport);
        kycGroupId = _kycGroupId;
    }

    /// @notice Issue yourself a demo KYC credential
    /// @param identityCommitment Your Semaphore identity commitment
    function selfIssue(uint256 identityCommitment) external {
        if (claimed[msg.sender]) revert AlreadyClaimed();
        if (identityCommitment == 0) revert ZeroCommitment();

        claimed[msg.sender] = true;
        totalIssued++;

        passport.issueCredential(kycGroupId, identityCommitment);
        emit DemoCredentialIssued(msg.sender, identityCommitment);
    }

    /// @notice Check if an address has already claimed
    function hasClaimed(address addr) external view returns (bool) {
        return claimed[addr];
    }
}
