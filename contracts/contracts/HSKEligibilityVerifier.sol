// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {IEligibilityVerifier} from "./IEligibilityVerifier.sol";

interface IEligibilityPassport {
    function verifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool);
}

interface IEligibilityFreshnessComposer {
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
}

/// @title HSKEligibilityVerifier
/// @notice One policy ID, one proof bundle, one verifier call for private compliance gates.
/// @dev Freshness proofs use a separate identity namespace, so caller-bound freshness
///      policies derive an account-specific freshness scope.
contract HSKEligibilityVerifier is IEligibilityVerifier {
    uint256 private constant FRESHNESS_SCOPE_MASK = (uint256(1) << 250) - 1;

    address public owner;
    IEligibilityPassport public immutable passport;
    IEligibilityFreshnessComposer public immutable freshnessComposer;

    mapping(bytes32 => PolicyConfig) private _policies;
    mapping(bytes32 => mapping(uint256 => bool)) public consumedNullifiers;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PolicySet(bytes32 indexed policyId, string metadataURI);
    event PolicyDisabled(bytes32 indexed policyId);
    event EligibilityVerified(bytes32 indexed policyId, address indexed account, uint256 indexed nullifier);

    error NotOwner();
    error InvalidPolicy();
    error NotEligible(bytes32 policyId, address account);
    error NullifierAlreadyUsed(bytes32 policyId, uint256 nullifier);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _passport, address _freshnessComposer) {
        if (_passport == address(0)) revert InvalidPolicy();
        owner = msg.sender;
        passport = IEligibilityPassport(_passport);
        freshnessComposer = IEligibilityFreshnessComposer(_freshnessComposer);
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidPolicy();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setPolicy(bytes32 policyId, PolicyConfig calldata config) external onlyOwner {
        if (policyId == bytes32(0)) revert InvalidPolicy();
        _validatePolicy(config);

        PolicyConfig storage p = _policies[policyId];
        p.active = config.active;
        p.callerBound = config.callerBound;
        p.semaphoreScope = config.semaphoreScope;
        p.freshnessGroupId = config.freshnessGroupId;
        p.freshnessWindowSeconds = config.freshnessWindowSeconds;
        p.freshnessScope = config.freshnessScope;
        p.metadataURI = config.metadataURI;

        delete p.requiredCredentialGroups;
        for (uint256 i = 0; i < config.requiredCredentialGroups.length; i++) {
            p.requiredCredentialGroups.push(config.requiredCredentialGroups[i]);
        }

        delete p.allowedJurisdictionGroups;
        for (uint256 i = 0; i < config.allowedJurisdictionGroups.length; i++) {
            p.allowedJurisdictionGroups.push(config.allowedJurisdictionGroups[i]);
        }

        if (config.active) emit PolicySet(policyId, config.metadataURI);
        else emit PolicyDisabled(policyId);
    }

    function getPolicy(bytes32 policyId) external view returns (PolicyConfig memory) {
        PolicyConfig storage p = _policies[policyId];
        uint256[] memory required = new uint256[](p.requiredCredentialGroups.length);
        for (uint256 i = 0; i < required.length; i++) required[i] = p.requiredCredentialGroups[i];

        uint256[] memory jurisdictions = new uint256[](p.allowedJurisdictionGroups.length);
        for (uint256 i = 0; i < jurisdictions.length; i++) jurisdictions[i] = p.allowedJurisdictionGroups[i];

        return PolicyConfig({
            active: p.active,
            callerBound: p.callerBound,
            semaphoreScope: p.semaphoreScope,
            requiredCredentialGroups: required,
            allowedJurisdictionGroups: jurisdictions,
            freshnessGroupId: p.freshnessGroupId,
            freshnessWindowSeconds: p.freshnessWindowSeconds,
            freshnessScope: p.freshnessScope,
            metadataURI: p.metadataURI
        });
    }

    function verifyEligibility(
        bytes32 policyId,
        EligibilityProof calldata proof,
        address account
    ) external view returns (bool) {
        return _verifyEligibility(policyId, proof, account);
    }

    function requireEligible(
        bytes32 policyId,
        EligibilityProof calldata proof,
        address account
    ) external returns (bool) {
        if (!_verifyEligibility(policyId, proof, account)) revert NotEligible(policyId, account);

        uint256 nullifier = _eligibilityNullifier(_policies[policyId], proof);
        if (consumedNullifiers[policyId][nullifier]) revert NullifierAlreadyUsed(policyId, nullifier);
        consumedNullifiers[policyId][nullifier] = true;

        emit EligibilityVerified(policyId, account, nullifier);
        return true;
    }

    function _validatePolicy(PolicyConfig calldata config) private view {
        bool hasSemaphoreCredential =
            config.requiredCredentialGroups.length > 0 || config.allowedJurisdictionGroups.length > 0;
        bool hasFreshness = config.freshnessWindowSeconds > 0;

        if (config.active && !hasSemaphoreCredential && !hasFreshness) revert InvalidPolicy();
        if (config.callerBound && !hasSemaphoreCredential && !hasFreshness) revert InvalidPolicy();
        if (config.semaphoreScope == 0 && hasSemaphoreCredential) revert InvalidPolicy();
        if (hasFreshness) {
            if (address(freshnessComposer) == address(0)) revert InvalidPolicy();
            if (config.freshnessGroupId == 0 || config.freshnessScope == 0) revert InvalidPolicy();
        }
    }

    function _verifyEligibility(
        bytes32 policyId,
        EligibilityProof calldata proof,
        address account
    ) private view returns (bool) {
        PolicyConfig storage p = _policies[policyId];
        if (!p.active) return false;
        if (p.requiredCredentialGroups.length != proof.credentialProofs.length) return false;

        uint256 sharedNullifier = 0;
        bool hasSharedNullifier = false;

        for (uint256 i = 0; i < p.requiredCredentialGroups.length; i++) {
            if (
                !_checkSemaphoreProofShape(
                    p,
                    proof.credentialProofs[i],
                    account,
                    sharedNullifier,
                    hasSharedNullifier
                )
            ) return false;
            if (!hasSharedNullifier) {
                sharedNullifier = proof.credentialProofs[i].nullifier;
                hasSharedNullifier = true;
            }
            if (!_safeVerifyCredential(p.requiredCredentialGroups[i], proof.credentialProofs[i])) {
                return false;
            }
        }

        if (p.allowedJurisdictionGroups.length > 0) {
            if (!proof.hasJurisdictionProof) return false;
            if (
                !_checkSemaphoreProofShape(
                    p,
                    proof.jurisdictionProof,
                    account,
                    sharedNullifier,
                    hasSharedNullifier
                )
            ) return false;
            if (!hasSharedNullifier) {
                sharedNullifier = proof.jurisdictionProof.nullifier;
                hasSharedNullifier = true;
            }
            if (!_verifyAnyJurisdiction(p, proof.jurisdictionProof)) return false;
        }

        if (p.freshnessWindowSeconds > 0) {
            if (!proof.hasFreshnessProof) return false;
            if (proof.freshnessProof.scope != _freshnessScope(p, account)) return false;
            uint256 cutoff = block.timestamp > p.freshnessWindowSeconds
                ? block.timestamp - p.freshnessWindowSeconds
                : 0;
            if (proof.freshnessProof.earliestAcceptable < cutoff) return false;
            if (!_safeVerifyFreshness(p, proof.freshnessProof)) return false;
        }

        return true;
    }

    function _checkSemaphoreProofShape(
        PolicyConfig storage p,
        ISemaphore.SemaphoreProof calldata semaphoreProof,
        address account,
        uint256 sharedNullifier,
        bool hasSharedNullifier
    ) private view returns (bool) {
        if (p.callerBound && semaphoreProof.message != uint256(uint160(account))) return false;
        if (semaphoreProof.scope != p.semaphoreScope) return false;
        if (hasSharedNullifier && semaphoreProof.nullifier != sharedNullifier) return false;
        return true;
    }

    function _verifyAnyJurisdiction(
        PolicyConfig storage p,
        ISemaphore.SemaphoreProof calldata jurisdictionProof
    ) private view returns (bool) {
        for (uint256 i = 0; i < p.allowedJurisdictionGroups.length; i++) {
            if (_safeVerifyCredential(p.allowedJurisdictionGroups[i], jurisdictionProof)) return true;
        }
        return false;
    }

    function _safeVerifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata semaphoreProof
    ) private view returns (bool) {
        (bool ok, bytes memory data) = address(passport).staticcall(
            abi.encodeWithSelector(passport.verifyCredential.selector, groupId, semaphoreProof)
        );
        return ok && data.length == 32 && abi.decode(data, (bool));
    }

    function _safeVerifyFreshness(
        PolicyConfig storage p,
        FreshnessProof calldata freshnessProof
    ) private view returns (bool) {
        (bool ok, bytes memory data) = address(freshnessComposer).staticcall(
            abi.encodeWithSelector(
                freshnessComposer.previewVerifyFresh.selector,
                p.freshnessGroupId,
                freshnessProof.merkleRoot,
                freshnessProof.earliestAcceptable,
                freshnessProof.scope,
                freshnessProof.nullifier,
                freshnessProof.proofA,
                freshnessProof.proofB,
                freshnessProof.proofC
            )
        );
        return ok && data.length == 32 && abi.decode(data, (bool));
    }

    function _freshnessScope(PolicyConfig storage p, address account) private view returns (uint256) {
        if (!p.callerBound) return p.freshnessScope;
        return uint256(keccak256(abi.encodePacked(p.freshnessScope, account))) & FRESHNESS_SCOPE_MASK;
    }

    function _eligibilityNullifier(
        PolicyConfig storage p,
        EligibilityProof calldata proof
    ) private view returns (uint256) {
        if (p.requiredCredentialGroups.length > 0) return proof.credentialProofs[0].nullifier;
        if (p.allowedJurisdictionGroups.length > 0) return proof.jurisdictionProof.nullifier;
        return proof.freshnessProof.nullifier;
    }
}
