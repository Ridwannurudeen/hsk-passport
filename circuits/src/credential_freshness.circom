pragma circom 2.1.9;

// circomlib resolved via circom -l <path>. build.js passes
// contracts/node_modules/circomlib/circuits. On non-Windows CI / VPS, install
// circomlib at the same relative path (or pass -l explicitly).
include "poseidon.circom";
include "comparators.circom";
include "mux1.circom";

// ---------------------------------------------------------------------------
// HSK Passport — Credential Freshness ZK proof
//
// Proves that the prover holds a credential that was issued no earlier than
// `earliestAcceptable`, without revealing the identity commitment or the
// exact issuance time.
//
// Private inputs:
//   - identitySecret:  scalar, prover's secret (binds the nullifier)
//   - issuanceTime:    unix seconds at which the credential was issued
//   - pathElements[D]: Merkle sibling hashes from leaf up to root
//   - pathIndices[D]:  0 / 1 per level (left/right child)
//
// Public inputs:
//   - merkleRoot:          current freshness-tree root (on-chain)
//   - earliestAcceptable:  dApp-supplied freshness threshold (unix seconds)
//   - scope:               per-dApp / per-action nullifier scope
//
// Public outputs:
//   - nullifier:   Poseidon(identitySecret, scope) — prevents replay within a scope
//
// Design notes:
//   - Depth D is the tree depth (16 → 65k max credentials per group). Picked to
//     keep constraint count ~5–10k for sub-5s browser proof time.
//   - Leaf = Poseidon(identityCommitment, issuanceTime). Because only issuers can
//     insert leaves on-chain, a valid proof demonstrates (identityCommitment,
//     issuanceTime) was signed off by the issuer at issuance time.
//   - identityCommitment = Poseidon(identitySecret). NOT compatible with
//     Semaphore v4's EdDSA-derived commitment — this is a separate identity
//     namespace used only for freshness credentials. Binding to Semaphore
//     identity would require EdDSA-in-circuit which is out of scope.
//   - `issuanceTime >= earliestAcceptable` is enforced as an unsigned
//     comparison with a 64-bit range check. Unix seconds fit comfortably.
// ---------------------------------------------------------------------------

template MerkleInclusion(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;

    component hashers[depth];
    component muxLeft[depth];
    component muxRight[depth];

    signal levelHashes[depth + 1];
    levelHashes[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        // pathIndices[i] must be boolean
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // If pathIndices[i] == 0, current is left; sibling is right.
        // If pathIndices[i] == 1, current is right; sibling is left.
        muxLeft[i] = Mux1();
        muxLeft[i].c[0] <== levelHashes[i];
        muxLeft[i].c[1] <== pathElements[i];
        muxLeft[i].s <== pathIndices[i];

        muxRight[i] = Mux1();
        muxRight[i].c[0] <== pathElements[i];
        muxRight[i].c[1] <== levelHashes[i];
        muxRight[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== muxLeft[i].out;
        hashers[i].inputs[1] <== muxRight[i].out;
        levelHashes[i + 1] <== hashers[i].out;
    }

    root <== levelHashes[depth];
}

template CredentialFreshness(depth) {
    // ---- private inputs ----
    signal input identitySecret;
    signal input issuanceTime;
    signal input pathElements[depth];
    signal input pathIndices[depth];

    // ---- public inputs ----
    signal input merkleRoot;
    signal input earliestAcceptable;
    signal input scope;

    // ---- public outputs ----
    signal output nullifier;

    // 1. Derive identity commitment from secret.
    component commitHasher = Poseidon(1);
    commitHasher.inputs[0] <== identitySecret;
    signal identityCommitment;
    identityCommitment <== commitHasher.out;

    // 2. Compute leaf = Poseidon(identityCommitment, issuanceTime).
    component leafHasher = Poseidon(2);
    leafHasher.inputs[0] <== identityCommitment;
    leafHasher.inputs[1] <== issuanceTime;
    signal leaf;
    leaf <== leafHasher.out;

    // 3. Prove leaf is in the freshness tree rooted at merkleRoot.
    component inclusion = MerkleInclusion(depth);
    inclusion.leaf <== leaf;
    for (var i = 0; i < depth; i++) {
        inclusion.pathElements[i] <== pathElements[i];
        inclusion.pathIndices[i] <== pathIndices[i];
    }
    inclusion.root === merkleRoot;

    // 4. Enforce issuanceTime >= earliestAcceptable.
    //    Both are < 2^64 (unix seconds). Use 64-bit unsigned comparison.
    component freshness = GreaterEqThan(64);
    freshness.in[0] <== issuanceTime;
    freshness.in[1] <== earliestAcceptable;
    freshness.out === 1;

    // 5. Derive nullifier = Poseidon(identitySecret, scope).
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== identitySecret;
    nullifierHasher.inputs[1] <== scope;
    nullifier <== nullifierHasher.out;
}

// Tree depth 16 → up to 65,536 freshness credentials per group.
// Constraint estimate: ~5k for Merkle + ~400 for Poseidon hashes + ~200 for
// range check = ~5.5–6k. Browser proof time target: 2–4 s.
component main {public [merkleRoot, earliestAcceptable, scope]} = CredentialFreshness(16);
