import { poseidon1, poseidon2 } from "poseidon-lite";

/**
 * Poseidon-based Merkle tree matching the on-chain `FreshnessRegistry` leaf convention
 * and the `credential_freshness.circom` circuit layout.
 *
 * Leaves are Poseidon(identityCommitment, issuanceTime) where
 * identityCommitment = Poseidon(identitySecret).
 *
 * Tree depth is fixed at 16 — same as the circuit's `CredentialFreshness(16)` instantiation.
 * Empty leaves default to BigInt(0). Internal zero-subtree roots are pre-computed lazily.
 */
const TREE_DEPTH = 16;

function zeroRoots(depth: number): bigint[] {
  const zeros: bigint[] = new Array(depth + 1);
  zeros[0] = 0n;
  for (let i = 1; i <= depth; i++) {
    zeros[i] = poseidon2([zeros[i - 1], zeros[i - 1]]);
  }
  return zeros;
}

export interface FreshnessMerkleProof {
  leaf: bigint;
  index: number;
  pathElements: bigint[];
  pathIndices: number[];
  root: bigint;
}

export class FreshnessTree {
  readonly depth: number;
  private readonly leaves: bigint[] = [];
  private readonly zeros: bigint[];

  constructor(depth: number = TREE_DEPTH) {
    this.depth = depth;
    this.zeros = zeroRoots(depth);
  }

  static makeLeaf(identityCommitment: bigint, issuanceTime: bigint | number): bigint {
    return poseidon2([identityCommitment, BigInt(issuanceTime)]);
  }

  static identityCommitment(identitySecret: bigint): bigint {
    return poseidon1([identitySecret]);
  }

  static nullifier(identitySecret: bigint, scope: bigint | number): bigint {
    return poseidon2([identitySecret, BigInt(scope)]);
  }

  insert(leaf: bigint): number {
    const index = this.leaves.length;
    if (index >= 1 << this.depth) throw new Error("Freshness tree full");
    this.leaves.push(leaf);
    return index;
  }

  get size(): number {
    return this.leaves.length;
  }

  root(): bigint {
    return this.computeRootAt(this.leaves);
  }

  private computeRootAt(leaves: bigint[]): bigint {
    let layer = leaves.slice();
    for (let level = 0; level < this.depth; level++) {
      const next: bigint[] = [];
      const layerLength = Math.max(layer.length, 1);
      for (let i = 0; i < layerLength; i += 2) {
        const left = i < layer.length ? layer[i] : this.zeros[level];
        const right = i + 1 < layer.length ? layer[i + 1] : this.zeros[level];
        next.push(poseidon2([left, right]));
      }
      layer = next;
    }
    return layer[0] ?? this.zeros[this.depth];
  }

  proof(index: number): FreshnessMerkleProof {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`index ${index} out of range (size=${this.leaves.length})`);
    }
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let layer = this.leaves.slice();
    let currentIndex = index;
    for (let level = 0; level < this.depth; level++) {
      const siblingIndex = currentIndex ^ 1;
      const sibling = siblingIndex < layer.length ? layer[siblingIndex] : this.zeros[level];
      pathElements.push(sibling);
      pathIndices.push(currentIndex & 1);
      const next: bigint[] = [];
      for (let i = 0; i < Math.max(layer.length, 1); i += 2) {
        const left = i < layer.length ? layer[i] : this.zeros[level];
        const right = i + 1 < layer.length ? layer[i + 1] : this.zeros[level];
        next.push(poseidon2([left, right]));
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
