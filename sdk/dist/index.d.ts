import { JsonRpcProvider, Signer, type TransactionReceipt } from "ethers";
import { Identity } from "@semaphore-protocol/identity";
import { type SemaphoreProof } from "@semaphore-protocol/proof";
import { type NetworkName } from "./addresses";
export { DEPLOYMENTS, type NetworkName } from "./addresses";
export { Identity } from "@semaphore-protocol/identity";
export type { SemaphoreProof } from "@semaphore-protocol/proof";
/** Credential status for a specific group */
export interface CredentialStatus {
    groupId: number;
    groupName: string;
    hasCredential: boolean;
    schemaHash: string;
}
/** Formatted proof ready for on-chain submission */
export interface HSKPassportProof {
    merkleTreeDepth: number;
    merkleTreeRoot: bigint;
    nullifier: bigint;
    message: bigint;
    scope: bigint;
    points: bigint[];
    raw: SemaphoreProof;
}
/** Group info from chain */
export interface GroupInfo {
    groupId: number;
    name: string;
    issuer: string;
    memberCount: number;
    active: boolean;
    schemaHash: string;
}
/**
 * HSK Passport SDK — Privacy-preserving ZK credential verification for HashKey Chain
 *
 * @example
 * ```ts
 * import { HSKPassport } from "@hsk-passport/sdk";
 *
 * const passport = HSKPassport.connect("hashkey-testnet");
 * const identity = passport.createIdentity("user-secret");
 * const proof = await passport.generateProof(identity, 3, "my-action");
 * const valid = await passport.verifyProof(3, proof);
 * ```
 */
export declare class HSKPassport {
    private provider;
    private signer?;
    private passportContract;
    private semaphoreContract;
    private network;
    private constructor();
    /** Connect to HSK Passport on a specific network */
    static connect(network: NetworkName, signerOrProvider?: Signer | JsonRpcProvider): HSKPassport;
    /** Create a deterministic Semaphore identity from a secret (e.g., wallet signature) */
    createIdentity(secret: string): Identity;
    /** Get the deployment addresses for the connected network */
    getAddresses(): {
        readonly chainId: 133;
        readonly rpcUrl: "https://testnet.hsk.xyz";
        readonly explorerUrl: "https://hashkey-testnet.blockscout.com";
        readonly contracts: {
            readonly semaphore: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9";
            readonly credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1";
            readonly hskPassport: "0x79A0E1160FA829595f45f0479782095ed497d5E6";
            readonly demoIssuer: "0xD6CB3393B9e1E162ed3EF8187082511d20Be28d1";
            readonly gatedRWA: "0xFc6bDE32f79ad43696abc6A2a6291bfA8AF1D249";
        };
        readonly groups: {
            readonly KYC_VERIFIED: 15;
            readonly ACCREDITED_INVESTOR: 16;
            readonly HK_RESIDENT: 17;
        };
    };
    /** Get group info from chain */
    getGroupInfo(groupId: number): Promise<GroupInfo>;
    /** Check if an identity has a credential in a group */
    hasCredential(groupId: number, identity: Identity): Promise<boolean>;
    /** Get credential status for all default groups */
    getCredentials(identity: Identity): Promise<CredentialStatus[]>;
    /** Get all active group members (revocation-aware) */
    getGroupMembers(groupId: number): Promise<bigint[]>;
    /**
     * Generate a zero-knowledge proof of credential ownership
     *
     * @param identity - The user's Semaphore identity
     * @param groupId - The credential group to prove membership in
     * @param scope - Action scope (unique per action for sybil resistance)
     * @param message - Optional message to bind to the proof (default: 1)
     */
    generateProof(identity: Identity, groupId: number, scope: number | bigint | string, message?: number | bigint): Promise<HSKPassportProof>;
    /** Verify a proof on-chain (read-only, does not consume nullifier) */
    verifyProof(groupId: number, proof: HSKPassportProof): Promise<boolean>;
    /** Submit and validate a proof on-chain (consumes nullifier, requires signer) */
    submitProof(groupId: number, proof: HSKPassportProof): Promise<TransactionReceipt>;
}
