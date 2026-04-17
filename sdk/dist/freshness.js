"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HSKPassportFreshnessClient = exports.FreshnessTree = exports.DEFAULT_ARTEFACTS = exports.FRESHNESS_TREE_DEPTH = void 0;
exports.createFreshnessIdentity = createFreshnessIdentity;
exports.generateFreshnessProof = generateFreshnessProof;
const ethers_1 = require("ethers");
const poseidon_lite_1 = require("poseidon-lite");
// snarkjs has no published types; require it at runtime
// eslint-disable-next-line @typescript-eslint/no-require-imports
const snarkjs = require("snarkjs");
exports.FRESHNESS_TREE_DEPTH = 16;
const HSK_PASSPORT_FRESHNESS_ABI = [
    "function verifyFresh(uint256 groupId, uint256 merkleRoot, uint256 earliestAcceptable, uint256 scope, uint256 nullifier, uint256[2] proofA, uint256[2][2] proofB, uint256[2] proofC) external",
    "function previewVerifyFresh(uint256 groupId, uint256 merkleRoot, uint256 earliestAcceptable, uint256 scope, uint256 nullifier, uint256[2] proofA, uint256[2][2] proofB, uint256[2] proofC) external view returns (bool)",
    "function nullifierConsumed(uint256, uint256) external view returns (bool)",
    "event FreshnessProofVerified(uint256 indexed groupId, uint256 indexed scope, uint256 indexed nullifier, uint256 earliestAcceptable)",
];
const FRESHNESS_REGISTRY_ABI = [
    "function currentRoot(uint256 groupId) external view returns (uint256)",
    "function leafCount(uint256 groupId) external view returns (uint256)",
    "function isKnownRoot(uint256 groupId, uint256 root) external view returns (bool)",
    "function addLeaf(uint256 groupId, uint256 leaf, uint256 newRoot) external",
    "event LeafAdded(uint256 indexed groupId, uint256 indexed leaf, uint256 newRoot, uint256 indexed index)",
];
/** Default URLs relative to the hsk-passport frontend origin. */
exports.DEFAULT_ARTEFACTS = {
    wasm: "/freshness/credential_freshness.wasm",
    zkey: "/freshness/credential_freshness.zkey",
};
// ---------------------------------------------------------------------------
// Merkle tree (matches FreshnessRegistry leaves + credential_freshness.circom)
// ---------------------------------------------------------------------------
function zeroRoots(depth) {
    const zeros = new Array(depth + 1);
    zeros[0] = 0n;
    for (let i = 1; i <= depth; i++) {
        zeros[i] = (0, poseidon_lite_1.poseidon2)([zeros[i - 1], zeros[i - 1]]);
    }
    return zeros;
}
class FreshnessTree {
    constructor(depth = exports.FRESHNESS_TREE_DEPTH) {
        this.leaves = [];
        this.depth = depth;
        this.zeros = zeroRoots(depth);
    }
    static makeLeaf(identityCommitment, issuanceTime) {
        return (0, poseidon_lite_1.poseidon2)([identityCommitment, BigInt(issuanceTime)]);
    }
    static identityCommitment(identitySecret) {
        return (0, poseidon_lite_1.poseidon1)([identitySecret]);
    }
    static nullifier(identitySecret, scope) {
        return (0, poseidon_lite_1.poseidon2)([identitySecret, BigInt(scope)]);
    }
    /** Populate the tree from an array of leaves in insertion order. */
    static fromLeaves(leaves, depth = exports.FRESHNESS_TREE_DEPTH) {
        const tree = new FreshnessTree(depth);
        for (const l of leaves)
            tree.insert(l);
        return tree;
    }
    insert(leaf) {
        const index = this.leaves.length;
        if (index >= 1 << this.depth)
            throw new Error("Freshness tree full");
        this.leaves.push(leaf);
        return index;
    }
    get size() {
        return this.leaves.length;
    }
    root() {
        let layer = this.leaves.slice();
        for (let level = 0; level < this.depth; level++) {
            const next = [];
            const layerLength = Math.max(layer.length, 1);
            for (let i = 0; i < layerLength; i += 2) {
                const left = i < layer.length ? layer[i] : this.zeros[level];
                const right = i + 1 < layer.length ? layer[i + 1] : this.zeros[level];
                next.push((0, poseidon_lite_1.poseidon2)([left, right]));
            }
            layer = next;
        }
        return layer[0] ?? this.zeros[this.depth];
    }
    proof(index) {
        if (index < 0 || index >= this.leaves.length) {
            throw new Error(`index ${index} out of range (size=${this.leaves.length})`);
        }
        const pathElements = [];
        const pathIndices = [];
        let layer = this.leaves.slice();
        let currentIndex = index;
        for (let level = 0; level < this.depth; level++) {
            const siblingIndex = currentIndex ^ 1;
            const sibling = siblingIndex < layer.length ? layer[siblingIndex] : this.zeros[level];
            pathElements.push(sibling);
            pathIndices.push(currentIndex & 1);
            const next = [];
            for (let i = 0; i < Math.max(layer.length, 1); i += 2) {
                const left = i < layer.length ? layer[i] : this.zeros[level];
                const right = i + 1 < layer.length ? layer[i + 1] : this.zeros[level];
                next.push((0, poseidon_lite_1.poseidon2)([left, right]));
            }
            layer = next;
            currentIndex = currentIndex >> 1;
        }
        return {
            leaf: this.leaves[index],
            index,
            pathElements,
            pathIndices,
            root: this.root(),
        };
    }
}
exports.FreshnessTree = FreshnessTree;
// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------
/** Create a freshness identity from a secret scalar. */
function createFreshnessIdentity(secret) {
    if (secret <= 0n)
        throw new Error("Freshness identity secret must be positive");
    return { secret, commitment: FreshnessTree.identityCommitment(secret) };
}
async function generateFreshnessProof(args) {
    const urls = args.artefacts ?? exports.DEFAULT_ARTEFACTS;
    const input = {
        identitySecret: args.identity.secret.toString(),
        issuanceTime: BigInt(args.issuanceTime).toString(),
        pathElements: args.merkleProof.pathElements.map((x) => x.toString()),
        pathIndices: args.merkleProof.pathIndices.map((x) => x.toString()),
        merkleRoot: args.merkleProof.root.toString(),
        earliestAcceptable: BigInt(args.earliestAcceptable).toString(),
        scope: BigInt(args.scope).toString(),
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, urls.wasm, urls.zkey);
    const [nullifier, merkleRoot, earliestAcceptable, scope] = publicSignals.map((s) => BigInt(s));
    return {
        proofA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
        proofB: [
            [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
            [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
        ],
        proofC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
        nullifier,
        merkleRoot,
        earliestAcceptable,
        scope,
    };
}
/** Thin client over HSKPassportFreshness + FreshnessRegistry. */
class HSKPassportFreshnessClient {
    constructor(opts) {
        const connected = opts.signer ?? opts.provider;
        this.composer = new ethers_1.Contract(opts.composerAddress, HSK_PASSPORT_FRESHNESS_ABI, connected);
        this.registry = new ethers_1.Contract(opts.registryAddress, FRESHNESS_REGISTRY_ABI, connected);
        this.signer = opts.signer;
    }
    /** Current on-chain Merkle root for a group (for convenience / integration checks). */
    async getCurrentRoot(groupId) {
        return await this.registry.currentRoot(BigInt(groupId));
    }
    async isKnownRoot(groupId, root) {
        return await this.registry.isKnownRoot(BigInt(groupId), root);
    }
    async isNullifierConsumed(scope, nullifier) {
        return await this.composer.nullifierConsumed(scope, nullifier);
    }
    /** Read-only verification for UX previews. */
    async previewVerify(groupId, proof) {
        return await this.composer.previewVerifyFresh(BigInt(groupId), proof.merkleRoot, proof.earliestAcceptable, proof.scope, proof.nullifier, proof.proofA, proof.proofB, proof.proofC);
    }
    /** Submit the proof on-chain. Marks the nullifier consumed on success. */
    async verifyFresh(groupId, proof) {
        if (!this.signer)
            throw new Error("Signer required for verifyFresh");
        const tx = await this.composer.verifyFresh(BigInt(groupId), proof.merkleRoot, proof.earliestAcceptable, proof.scope, proof.nullifier, proof.proofA, proof.proofB, proof.proofC);
        return await tx.wait();
    }
}
exports.HSKPassportFreshnessClient = HSKPassportFreshnessClient;
