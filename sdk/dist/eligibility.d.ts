import { JsonRpcProvider, Signer, type TransactionReceipt } from "ethers";
import type { FreshnessProof } from "./freshness";
export declare const HSK_ELIGIBILITY_VERIFIER_ABI: readonly ["function owner() view returns (address)", "function consumedNullifiers(bytes32,uint256) view returns (bool)", "function getPolicy(bytes32 policyId) view returns (tuple(bool active,bool callerBound,uint256 semaphoreScope,uint256[] requiredCredentialGroups,uint256[] allowedJurisdictionGroups,uint256 freshnessGroupId,uint256 freshnessWindowSeconds,uint256 freshnessScope,string metadataURI))", "function verifyEligibility(bytes32 policyId, tuple(tuple(uint256 merkleTreeDepth,uint256 merkleTreeRoot,uint256 nullifier,uint256 message,uint256 scope,uint256[8] points)[] credentialProofs,bool hasJurisdictionProof,tuple(uint256 merkleTreeDepth,uint256 merkleTreeRoot,uint256 nullifier,uint256 message,uint256 scope,uint256[8] points) jurisdictionProof,bool hasFreshnessProof,tuple(uint256 merkleRoot,uint256 earliestAcceptable,uint256 scope,uint256 nullifier,uint256[2] proofA,uint256[2][2] proofB,uint256[2] proofC) freshnessProof) proof,address account) view returns (bool)", "function requireEligible(bytes32 policyId, tuple(tuple(uint256 merkleTreeDepth,uint256 merkleTreeRoot,uint256 nullifier,uint256 message,uint256 scope,uint256[8] points)[] credentialProofs,bool hasJurisdictionProof,tuple(uint256 merkleTreeDepth,uint256 merkleTreeRoot,uint256 nullifier,uint256 message,uint256 scope,uint256[8] points) jurisdictionProof,bool hasFreshnessProof,tuple(uint256 merkleRoot,uint256 earliestAcceptable,uint256 scope,uint256 nullifier,uint256[2] proofA,uint256[2][2] proofB,uint256[2] proofC) freshnessProof) proof,address account) returns (bool)", "event EligibilityVerified(bytes32 indexed policyId,address indexed account,uint256 indexed nullifier)", "event PolicySet(bytes32 indexed policyId,string metadataURI)"];
export interface SemaphoreProofLike {
    merkleTreeDepth: number | bigint;
    merkleTreeRoot: bigint;
    nullifier: bigint;
    message: bigint;
    scope: bigint;
    points: readonly bigint[];
}
export interface EligibilityPolicyConfig {
    active: boolean;
    callerBound: boolean;
    semaphoreScope: bigint;
    requiredCredentialGroups: bigint[];
    allowedJurisdictionGroups: bigint[];
    freshnessGroupId: bigint;
    freshnessWindowSeconds: bigint;
    freshnessScope: bigint;
    metadataURI: string;
}
export interface EligibilityProofInput {
    credentialProofs: SemaphoreProofLike[];
    jurisdictionProof?: SemaphoreProofLike;
    freshnessProof?: FreshnessProof;
}
export interface EligibilityClientOptions {
    provider: JsonRpcProvider;
    signer?: Signer;
    verifierAddress: string;
}
export declare function eligibilityPolicyId(name: string): string;
export declare function eligibilityFreshnessScope(baseScope: bigint | number, account: string): bigint;
export declare function buildEligibilityProof(input: EligibilityProofInput): {
    credentialProofs: {
        merkleTreeDepth: bigint;
        merkleTreeRoot: bigint;
        nullifier: bigint;
        message: bigint;
        scope: bigint;
        points: bigint[];
    }[];
    hasJurisdictionProof: boolean;
    jurisdictionProof: {
        merkleTreeDepth: bigint;
        merkleTreeRoot: bigint;
        nullifier: bigint;
        message: bigint;
        scope: bigint;
        points: bigint[];
    };
    hasFreshnessProof: boolean;
    freshnessProof: {
        merkleRoot: bigint;
        earliestAcceptable: bigint;
        scope: bigint;
        nullifier: bigint;
        proofA: bigint[];
        proofB: bigint[][];
        proofC: bigint[];
    };
};
export declare class HSKEligibilityClient {
    private readonly verifier;
    private readonly signer?;
    constructor(opts: EligibilityClientOptions);
    getPolicy(policyId: string): Promise<EligibilityPolicyConfig>;
    isNullifierConsumed(policyId: string, nullifier: bigint): Promise<boolean>;
    verifyEligibility(policyId: string, proof: EligibilityProofInput, account: string): Promise<boolean>;
    requireEligible(policyId: string, proof: EligibilityProofInput, account: string): Promise<TransactionReceipt>;
}
