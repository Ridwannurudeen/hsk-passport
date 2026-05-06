import { Contract, id, JsonRpcProvider, Signer, solidityPackedKeccak256, type TransactionReceipt } from "ethers";
import type { FreshnessProof } from "./freshness";

const FRESHNESS_SCOPE_MASK = (1n << 250n) - 1n;

export const HSK_ELIGIBILITY_VERIFIER_ABI = [
  "function owner() view returns (address)",
  "function consumedNullifiers(bytes32,uint256) view returns (bool)",
  "function getPolicy(bytes32 policyId) view returns (tuple(bool active,bool callerBound,uint256 semaphoreScope,uint256[] requiredCredentialGroups,uint256[] allowedJurisdictionGroups,uint256 freshnessGroupId,uint256 freshnessWindowSeconds,uint256 freshnessScope,string metadataURI))",
  "function verifyEligibility(bytes32 policyId, tuple(tuple(uint256 merkleTreeDepth,uint256 merkleTreeRoot,uint256 nullifier,uint256 message,uint256 scope,uint256[8] points)[] credentialProofs,bool hasJurisdictionProof,tuple(uint256 merkleTreeDepth,uint256 merkleTreeRoot,uint256 nullifier,uint256 message,uint256 scope,uint256[8] points) jurisdictionProof,bool hasFreshnessProof,tuple(uint256 merkleRoot,uint256 earliestAcceptable,uint256 scope,uint256 nullifier,uint256[2] proofA,uint256[2][2] proofB,uint256[2] proofC) freshnessProof) proof,address account) view returns (bool)",
  "function requireEligible(bytes32 policyId, tuple(tuple(uint256 merkleTreeDepth,uint256 merkleTreeRoot,uint256 nullifier,uint256 message,uint256 scope,uint256[8] points)[] credentialProofs,bool hasJurisdictionProof,tuple(uint256 merkleTreeDepth,uint256 merkleTreeRoot,uint256 nullifier,uint256 message,uint256 scope,uint256[8] points) jurisdictionProof,bool hasFreshnessProof,tuple(uint256 merkleRoot,uint256 earliestAcceptable,uint256 scope,uint256 nullifier,uint256[2] proofA,uint256[2][2] proofB,uint256[2] proofC) freshnessProof) proof,address account) returns (bool)",
  "event EligibilityVerified(bytes32 indexed policyId,address indexed account,uint256 indexed nullifier)",
  "event PolicySet(bytes32 indexed policyId,string metadataURI)",
] as const;

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

const ZERO_SEMAPHORE_PROOF = {
  merkleTreeDepth: 0n,
  merkleTreeRoot: 0n,
  nullifier: 0n,
  message: 0n,
  scope: 0n,
  points: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
};

const ZERO_FRESHNESS_PROOF = {
  merkleRoot: 0n,
  earliestAcceptable: 0n,
  scope: 0n,
  nullifier: 0n,
  proofA: [0n, 0n],
  proofB: [
    [0n, 0n],
    [0n, 0n],
  ],
  proofC: [0n, 0n],
};

export function eligibilityPolicyId(name: string): string {
  return id(name);
}

export function eligibilityFreshnessScope(baseScope: bigint | number, account: string): bigint {
  return BigInt(solidityPackedKeccak256(["uint256", "address"], [baseScope, account])) &
    FRESHNESS_SCOPE_MASK;
}

function toSemaphoreTuple(proof: SemaphoreProofLike) {
  if (proof.points.length !== 8) {
    throw new Error("Semaphore proof must contain exactly 8 points");
  }
  return {
    merkleTreeDepth: BigInt(proof.merkleTreeDepth),
    merkleTreeRoot: proof.merkleTreeRoot,
    nullifier: proof.nullifier,
    message: proof.message,
    scope: proof.scope,
    points: proof.points.map((p) => BigInt(p)),
  };
}

function toFreshnessTuple(proof: FreshnessProof) {
  return {
    merkleRoot: proof.merkleRoot,
    earliestAcceptable: proof.earliestAcceptable,
    scope: proof.scope,
    nullifier: proof.nullifier,
    proofA: proof.proofA,
    proofB: proof.proofB,
    proofC: proof.proofC,
  };
}

export function buildEligibilityProof(input: EligibilityProofInput) {
  return {
    credentialProofs: input.credentialProofs.map(toSemaphoreTuple),
    hasJurisdictionProof: Boolean(input.jurisdictionProof),
    jurisdictionProof: input.jurisdictionProof ? toSemaphoreTuple(input.jurisdictionProof) : ZERO_SEMAPHORE_PROOF,
    hasFreshnessProof: Boolean(input.freshnessProof),
    freshnessProof: input.freshnessProof ? toFreshnessTuple(input.freshnessProof) : ZERO_FRESHNESS_PROOF,
  };
}

export class HSKEligibilityClient {
  private readonly verifier: Contract;
  private readonly signer?: Signer;

  constructor(opts: EligibilityClientOptions) {
    const connected = opts.signer ?? opts.provider;
    this.verifier = new Contract(opts.verifierAddress, HSK_ELIGIBILITY_VERIFIER_ABI, connected);
    this.signer = opts.signer;
  }

  async getPolicy(policyId: string): Promise<EligibilityPolicyConfig> {
    const p = await this.verifier.getPolicy(policyId);
    return {
      active: p.active,
      callerBound: p.callerBound,
      semaphoreScope: BigInt(p.semaphoreScope),
      requiredCredentialGroups: p.requiredCredentialGroups.map((g: bigint) => BigInt(g)),
      allowedJurisdictionGroups: p.allowedJurisdictionGroups.map((g: bigint) => BigInt(g)),
      freshnessGroupId: BigInt(p.freshnessGroupId),
      freshnessWindowSeconds: BigInt(p.freshnessWindowSeconds),
      freshnessScope: BigInt(p.freshnessScope),
      metadataURI: p.metadataURI,
    };
  }

  async isNullifierConsumed(policyId: string, nullifier: bigint): Promise<boolean> {
    return await this.verifier.consumedNullifiers(policyId, nullifier);
  }

  async verifyEligibility(
    policyId: string,
    proof: EligibilityProofInput,
    account: string
  ): Promise<boolean> {
    return await this.verifier.verifyEligibility(policyId, buildEligibilityProof(proof), account);
  }

  async requireEligible(
    policyId: string,
    proof: EligibilityProofInput,
    account: string
  ): Promise<TransactionReceipt> {
    if (!this.signer) throw new Error("Signer required for requireEligible");
    const tx = await this.verifier.requireEligible(policyId, buildEligibilityProof(proof), account);
    const receipt = await tx.wait();
    if (!receipt) throw new Error("Eligibility transaction failed");
    return receipt;
  }
}
