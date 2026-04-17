import { JsonRpcProvider, Signer, type TransactionReceipt } from "ethers";
import { Identity } from "@semaphore-protocol/identity";
import { type SemaphoreProof } from "@semaphore-protocol/proof";
import { type NetworkName } from "./addresses";
export { DEPLOYMENTS, type NetworkName } from "./addresses";
export { Identity } from "@semaphore-protocol/identity";
export type { SemaphoreProof } from "@semaphore-protocol/proof";
export { FreshnessTree, FRESHNESS_TREE_DEPTH, DEFAULT_ARTEFACTS, createFreshnessIdentity, generateFreshnessProof, HSKPassportFreshnessClient, type FreshnessIdentity, type FreshnessMerkleProof, type FreshnessProof, type ArtefactUrls, type FreshnessClientOptions, } from "./freshness";
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
 * import { HSKPassport } from "hsk-passport-sdk";
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
            readonly hskPassport: "0x7d2E692A08f2fb0724238396e0436106b4FbD792";
            readonly demoIssuer: "0xBf7d566B8077A098F6844fb6b827D2A4118C88C3";
            readonly gatedRWA: "0xb6955cb3e442c4222fFc3b92c322851109d0b9c9";
            readonly kycGatedAirdrop: "0x71c96016CBCAeE7B2Edc8b40Fec45de1d16Fb4b8";
            readonly kycGatedLending: "0x37179886986bd35a4d580f157f55f249c43A0BFD";
            readonly jurisdictionGatedPool: "0x305f5F0b44d541785305DaDb372f118A9284Ce4D";
            readonly hashKeyDIDBridge: "0xF072D06adcA2B6d5941bde6cc87f41feC5F5Ea7a";
            readonly hashKeyKYCImporter: "0x5431ae6D2f5c3Ad3373B7B4DD4066000D681f5B8";
            readonly issuerRegistry: "0x5BbAe6e90b82c7c51EbA9cA6D844D698dE2eb504";
            readonly timelock: "0xb07Bc78559CbDe44c047b1dC3028d13c4f863D8A";
            readonly freshnessRegistry: "0xd251ecAD1a863299BAD2E25B93377B736a753938";
            readonly freshnessVerifier: "0x59A03fF053464150b066e78d22AEc2F69D081394";
            readonly hskPassportFreshness: "0xFF790dE1537a84220cD12ef648650034D4725fBb";
        };
        readonly deployBlock: 26800000;
        readonly groups: {
            readonly KYC_VERIFIED: 25;
            readonly ACCREDITED_INVESTOR: 26;
            readonly HK_RESIDENT: 27;
            readonly SG_RESIDENT: 28;
            readonly AE_RESIDENT: 29;
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
     * @param message - REQUIRED. Bind the proof to prevent front-running.
     *                  Pass `BigInt(callerAddress)` where callerAddress is the msg.sender
     *                  that will submit the proof on-chain. The dApp's verifier contract
     *                  MUST check that `proof.message == uint256(uint160(msg.sender))`.
     *                  Passing arbitrary values (like 1) leaves the proof vulnerable
     *                  to front-running.
     */
    generateProof(identity: Identity, groupId: number, scope: number | bigint | string, message: number | bigint): Promise<HSKPassportProof>;
    /** Verify a proof on-chain (read-only, does not consume nullifier) */
    verifyProof(groupId: number, proof: HSKPassportProof): Promise<boolean>;
    /** Submit and validate a proof on-chain (consumes nullifier, requires signer) */
    submitProof(groupId: number, proof: HSKPassportProof): Promise<TransactionReceipt>;
}
