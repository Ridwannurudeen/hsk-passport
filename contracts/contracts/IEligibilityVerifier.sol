// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// @title IEligibilityVerifier
/// @notice Standard dApp-facing surface for private eligibility policies on HashKey Chain.
interface IEligibilityVerifier {
    struct FreshnessProof {
        uint256 merkleRoot;
        uint256 earliestAcceptable;
        uint256 scope;
        uint256 nullifier;
        uint256[2] proofA;
        uint256[2][2] proofB;
        uint256[2] proofC;
    }

    struct EligibilityProof {
        ISemaphore.SemaphoreProof[] credentialProofs;
        bool hasJurisdictionProof;
        ISemaphore.SemaphoreProof jurisdictionProof;
        bool hasFreshnessProof;
        FreshnessProof freshnessProof;
    }

    struct PolicyConfig {
        bool active;
        bool callerBound;
        uint256 semaphoreScope;
        uint256[] requiredCredentialGroups;
        uint256[] allowedJurisdictionGroups;
        uint256 freshnessGroupId;
        uint256 freshnessWindowSeconds;
        uint256 freshnessScope;
        string metadataURI;
    }

    function verifyEligibility(
        bytes32 policyId,
        EligibilityProof calldata proof,
        address account
    ) external view returns (bool);

    function requireEligible(
        bytes32 policyId,
        EligibilityProof calldata proof,
        address account
    ) external returns (bool);
}
