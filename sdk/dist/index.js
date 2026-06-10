"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HSKPassport = exports.HSKPassportFreshnessClient = exports.generateFreshnessProof = exports.createFreshnessIdentity = exports.DEFAULT_ARTEFACTS = exports.FRESHNESS_TREE_DEPTH = exports.FreshnessTree = exports.Identity = exports.DEPLOYMENTS = void 0;
const ethers_1 = require("ethers");
const identity_1 = require("@semaphore-protocol/identity");
const group_1 = require("@semaphore-protocol/group");
const proof_1 = require("@semaphore-protocol/proof");
const addresses_1 = require("./addresses");
const abi_1 = require("./abi");
var addresses_2 = require("./addresses");
Object.defineProperty(exports, "DEPLOYMENTS", { enumerable: true, get: function () { return addresses_2.DEPLOYMENTS; } });
var identity_2 = require("@semaphore-protocol/identity");
Object.defineProperty(exports, "Identity", { enumerable: true, get: function () { return identity_2.Identity; } });
// Per-prover ZK credential-freshness (additive; unrelated to the Semaphore identity path above).
var freshness_1 = require("./freshness");
Object.defineProperty(exports, "FreshnessTree", { enumerable: true, get: function () { return freshness_1.FreshnessTree; } });
Object.defineProperty(exports, "FRESHNESS_TREE_DEPTH", { enumerable: true, get: function () { return freshness_1.FRESHNESS_TREE_DEPTH; } });
Object.defineProperty(exports, "DEFAULT_ARTEFACTS", { enumerable: true, get: function () { return freshness_1.DEFAULT_ARTEFACTS; } });
Object.defineProperty(exports, "createFreshnessIdentity", { enumerable: true, get: function () { return freshness_1.createFreshnessIdentity; } });
Object.defineProperty(exports, "generateFreshnessProof", { enumerable: true, get: function () { return freshness_1.generateFreshnessProof; } });
Object.defineProperty(exports, "HSKPassportFreshnessClient", { enumerable: true, get: function () { return freshness_1.HSKPassportFreshnessClient; } });
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
class HSKPassport {
    constructor(network, signerOrProvider) {
        const deployment = addresses_1.DEPLOYMENTS[network];
        this.network = network;
        if (signerOrProvider && "getAddress" in signerOrProvider) {
            this.signer = signerOrProvider;
            this.provider = signerOrProvider.provider;
        }
        else {
            this.provider =
                signerOrProvider ||
                    new ethers_1.JsonRpcProvider(deployment.rpcUrl);
        }
        this.passportContract = new ethers_1.Contract(deployment.contracts.hskPassport, abi_1.HSK_PASSPORT_ABI, this.signer || this.provider);
        this.semaphoreContract = new ethers_1.Contract(deployment.contracts.semaphore, abi_1.SEMAPHORE_ABI, this.provider);
    }
    /** Connect to HSK Passport on a specific network */
    static connect(network, signerOrProvider) {
        return new HSKPassport(network, signerOrProvider);
    }
    /** Create a deterministic Semaphore identity from a secret (e.g., wallet signature) */
    createIdentity(secret) {
        return new identity_1.Identity(secret);
    }
    /** Get the deployment addresses for the connected network */
    getAddresses() {
        return addresses_1.DEPLOYMENTS[this.network];
    }
    /** Get group info from chain */
    async getGroupInfo(groupId) {
        const g = await this.passportContract.credentialGroups(groupId);
        return {
            groupId: Number(g.groupId),
            name: g.name,
            issuer: g.issuer,
            memberCount: Number(g.memberCount),
            active: g.active,
            schemaHash: g.schemaHash,
        };
    }
    /** Check if an identity has a credential in a group */
    async hasCredential(groupId, identity) {
        return this.passportContract.hasCredential(groupId, identity.commitment);
    }
    /** Get credential status for all default groups */
    async getCredentials(identity) {
        const groups = addresses_1.DEPLOYMENTS[this.network].groups;
        const results = [];
        for (const [name, groupId] of Object.entries(groups)) {
            const has = await this.passportContract.hasCredential(groupId, identity.commitment);
            const info = await this.passportContract.credentialGroups(groupId);
            results.push({
                groupId,
                groupName: name,
                hasCredential: has,
                schemaHash: info.schemaHash,
            });
        }
        return results;
    }
    /** Page queryFilter in fixed block windows — public RPCs reject unbounded eth_getLogs. */
    async queryFilterPaged(filter, fromBlock) {
        const PAGE_SIZE = 9000;
        const latest = await this.provider.getBlockNumber();
        const events = [];
        for (let start = fromBlock; start <= latest; start += PAGE_SIZE) {
            const end = Math.min(start + PAGE_SIZE - 1, latest);
            const page = await this.passportContract.queryFilter(filter, start, end);
            events.push(...page);
        }
        return events;
    }
    /** Decode the identityCommitment from a CredentialIssued/CredentialRevoked log. */
    parseCommitment(event) {
        const parsed = this.passportContract.interface.parseLog({
            topics: [...event.topics],
            data: event.data,
        });
        return parsed?.args?.identityCommitment;
    }
    /** Get all active group members (revocation-aware) */
    async getGroupMembers(groupId) {
        const issuedFilter = this.passportContract.filters.CredentialIssued(groupId);
        const revokedFilter = this.passportContract.filters.CredentialRevoked(groupId);
        const fromBlock = addresses_1.DEPLOYMENTS[this.network].deployBlock;
        const [issuedEvents, revokedEvents] = await Promise.all([
            this.queryFilterPaged(issuedFilter, fromBlock),
            this.queryFilterPaged(revokedFilter, fromBlock),
        ]);
        const revokedSet = new Set(revokedEvents
            .map((e) => this.parseCommitment(e)?.toString())
            .filter(Boolean));
        return issuedEvents
            .map((e) => this.parseCommitment(e))
            .filter((m) => m !== undefined && !revokedSet.has(m.toString()));
    }
    /**
     * Reconstruct the on-chain Semaphore group: add every commitment ever issued
     * in insertion order, then zero each revoked leaf via removeMember. Semaphore v4
     * zeroes leaves in place, so an active-only re-indexed tree would not match the
     * on-chain Merkle root — this reconstruction does.
     */
    async buildGroup(groupId) {
        const issuedFilter = this.passportContract.filters.CredentialIssued(groupId);
        const revokedFilter = this.passportContract.filters.CredentialRevoked(groupId);
        const fromBlock = addresses_1.DEPLOYMENTS[this.network].deployBlock;
        const [issuedEvents, revokedEvents] = await Promise.all([
            this.queryFilterPaged(issuedFilter, fromBlock),
            this.queryFilterPaged(revokedFilter, fromBlock),
        ]);
        const group = new group_1.Group();
        for (const event of issuedEvents) {
            const commitment = this.parseCommitment(event);
            if (commitment !== undefined)
                group.addMember(commitment);
        }
        for (const event of revokedEvents) {
            const commitment = this.parseCommitment(event);
            if (commitment === undefined)
                continue;
            const index = group.indexOf(commitment);
            if (index !== -1)
                group.removeMember(index);
        }
        return group;
    }
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
    async generateProof(identity, groupId, scope, message) {
        if (message === undefined || message === null) {
            throw new Error("generateProof: 'message' is required and should be the caller's address as a bigint. " +
                "Pass BigInt(await signer.getAddress()) to prevent front-running.");
        }
        const group = await this.buildGroup(groupId);
        if (group.size === 0) {
            throw new Error("Group has no members");
        }
        if (group.indexOf(identity.commitment) === -1) {
            throw new Error("Identity is not a member of this group");
        }
        let scopeValue;
        if (typeof scope === "string") {
            const hex = Array.from(new TextEncoder().encode(scope), (b) => b.toString(16).padStart(2, "0")).join("");
            scopeValue = hex === "" ? 0n : BigInt("0x" + hex) % 2n ** 253n;
        }
        else {
            scopeValue = scope;
        }
        const raw = await (0, proof_1.generateProof)(identity, group, message, scopeValue);
        return {
            merkleTreeDepth: raw.merkleTreeDepth,
            merkleTreeRoot: BigInt(raw.merkleTreeRoot),
            nullifier: BigInt(raw.nullifier),
            message: BigInt(raw.message),
            scope: BigInt(raw.scope),
            points: raw.points.map((p) => BigInt(p)),
            raw,
        };
    }
    /** Verify a proof on-chain (read-only, does not consume nullifier) */
    async verifyProof(groupId, proof) {
        return this.semaphoreContract.verifyProof(groupId, {
            merkleTreeDepth: proof.merkleTreeDepth,
            merkleTreeRoot: proof.merkleTreeRoot,
            nullifier: proof.nullifier,
            message: proof.message,
            scope: proof.scope,
            points: proof.points,
        });
    }
    /** Submit and validate a proof on-chain (consumes nullifier, requires signer) */
    async submitProof(groupId, proof) {
        if (!this.signer)
            throw new Error("Signer required to submit proof");
        const tx = await this.passportContract.validateCredential(groupId, {
            merkleTreeDepth: proof.merkleTreeDepth,
            merkleTreeRoot: proof.merkleTreeRoot,
            nullifier: proof.nullifier,
            message: proof.message,
            scope: proof.scope,
            points: proof.points,
        });
        const receipt = await tx.wait();
        if (!receipt)
            throw new Error("Transaction failed");
        return receipt;
    }
}
exports.HSKPassport = HSKPassport;
