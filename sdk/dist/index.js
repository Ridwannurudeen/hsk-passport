"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HSKPassport = exports.Identity = exports.DEPLOYMENTS = void 0;
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
class HSKPassport {
    constructor(network, signerOrProvider) {
        const deployment = addresses_1.DEPLOYMENTS[network];
        this.network = network;
        if (signerOrProvider && "getAddress" in signerOrProvider) {
            this.signer = signerOrProvider;
            this.provider = signerOrProvider.provider;
        }
        else {
            this.provider = signerOrProvider || new ethers_1.JsonRpcProvider(deployment.rpcUrl);
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
    /** Get all active group members (revocation-aware) */
    async getGroupMembers(groupId) {
        const issuedFilter = this.passportContract.filters.CredentialIssued(groupId);
        const revokedFilter = this.passportContract.filters.CredentialRevoked(groupId);
        const [issuedEvents, revokedEvents] = await Promise.all([
            this.passportContract.queryFilter(issuedFilter, 0, "latest"),
            this.passportContract.queryFilter(revokedFilter, 0, "latest"),
        ]);
        const revokedSet = new Set(revokedEvents.map((e) => {
            const parsed = this.passportContract.interface.parseLog({
                topics: [...e.topics],
                data: e.data,
            });
            return parsed?.args?.identityCommitment?.toString();
        }).filter(Boolean));
        return issuedEvents
            .map((e) => {
            const parsed = this.passportContract.interface.parseLog({
                topics: [...e.topics],
                data: e.data,
            });
            return parsed?.args?.identityCommitment;
        })
            .filter((m) => m !== undefined && !revokedSet.has(m.toString()));
    }
    /**
     * Generate a zero-knowledge proof of credential ownership
     *
     * @param identity - The user's Semaphore identity
     * @param groupId - The credential group to prove membership in
     * @param scope - Action scope (unique per action for sybil resistance)
     * @param message - Optional message to bind to the proof (default: 1)
     */
    async generateProof(identity, groupId, scope, message = 1) {
        const members = await this.getGroupMembers(groupId);
        if (members.length === 0) {
            throw new Error("Group has no members");
        }
        if (!members.some((m) => m === identity.commitment)) {
            throw new Error("Identity is not a member of this group");
        }
        const group = new group_1.Group();
        for (const member of members) {
            group.addMember(member);
        }
        const scopeValue = typeof scope === "string" ? BigInt("0x" + Buffer.from(scope).toString("hex")) % (2n ** 253n) : scope;
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
