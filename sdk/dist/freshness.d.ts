/**
 * HSK Passport — Credential-freshness ZK module.
 *
 * Companion to the main HSKPassport class. Generates and verifies per-prover
 * credential-freshness proofs: prove a credential is within a dApp-supplied
 * freshness window without revealing the identity commitment or exact issuance
 * time.
 *
 * Circuit: credential_freshness.circom (tree depth 16, Poseidon + GreaterEqThan).
 * Artefacts (wasm + zkey + vkey) are served from the `freshness/` path of the
 * hsk-passport frontend — configurable via {@link ArtefactUrls}.
 */
import { JsonRpcProvider, Signer } from "ethers";
export declare const FRESHNESS_TREE_DEPTH = 16;
export interface ArtefactUrls {
    /** Path or URL to credential_freshness.wasm */
    wasm: string;
    /** Path or URL to freshness_final.zkey */
    zkey: string;
}
/** Default URLs relative to the hsk-passport frontend origin. */
export declare const DEFAULT_ARTEFACTS: ArtefactUrls;
export interface FreshnessIdentity {
    /** Keep private; required for proof generation. */
    secret: bigint;
    /** Poseidon(secret) — given to the issuer at credential issuance. */
    commitment: bigint;
}
export interface FreshnessMerkleProof {
    leaf: bigint;
    index: number;
    pathElements: bigint[];
    pathIndices: number[];
    root: bigint;
}
export interface FreshnessProof {
    /** Groth16 proof points, in the order expected by FreshnessVerifier. */
    proofA: [bigint, bigint];
    proofB: [[bigint, bigint], [bigint, bigint]];
    proofC: [bigint, bigint];
    /** Public signals, matching the circuit's declaration order. */
    nullifier: bigint;
    merkleRoot: bigint;
    earliestAcceptable: bigint;
    scope: bigint;
}
export declare class FreshnessTree {
    readonly depth: number;
    private readonly leaves;
    private readonly zeros;
    constructor(depth?: number);
    static makeLeaf(identityCommitment: bigint, issuanceTime: bigint | number): bigint;
    static identityCommitment(identitySecret: bigint): bigint;
    static nullifier(identitySecret: bigint, scope: bigint | number): bigint;
    /** Populate the tree from an array of leaves in insertion order. */
    static fromLeaves(leaves: bigint[], depth?: number): FreshnessTree;
    insert(leaf: bigint): number;
    get size(): number;
    root(): bigint;
    proof(index: number): FreshnessMerkleProof;
}
/** Create a freshness identity from a secret scalar. */
export declare function createFreshnessIdentity(secret: bigint): FreshnessIdentity;
interface GenerateProofArgs {
    identity: FreshnessIdentity;
    issuanceTime: bigint | number;
    merkleProof: FreshnessMerkleProof;
    earliestAcceptable: bigint | number;
    scope: bigint | number;
    artefacts?: ArtefactUrls;
}
export declare function generateFreshnessProof(args: GenerateProofArgs): Promise<FreshnessProof>;
export interface FreshnessClientOptions {
    provider: JsonRpcProvider;
    signer?: Signer;
    composerAddress: string;
    registryAddress: string;
}
/** Thin client over HSKPassportFreshness + FreshnessRegistry. */
export declare class HSKPassportFreshnessClient {
    private readonly composer;
    private readonly registry;
    private readonly signer?;
    constructor(opts: FreshnessClientOptions);
    /** Current on-chain Merkle root for a group (for convenience / integration checks). */
    getCurrentRoot(groupId: bigint | number): Promise<bigint>;
    isKnownRoot(groupId: bigint | number, root: bigint): Promise<boolean>;
    isNullifierConsumed(scope: bigint, nullifier: bigint): Promise<boolean>;
    /** Read-only verification for UX previews. */
    previewVerify(groupId: bigint | number, proof: FreshnessProof): Promise<boolean>;
    /** Submit the proof on-chain. Marks the nullifier consumed on success. */
    verifyFresh(groupId: bigint | number, proof: FreshnessProof): Promise<any>;
}
export {};
