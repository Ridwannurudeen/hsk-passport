/**
 * Browser-side credential-freshness primitives. Mirrors
 * hsk-passport-sdk/freshness.ts but keeps this page self-contained so the
 * unreleased SDK isn't a build dependency of the live frontend.
 */

"use client";

import { poseidon1, poseidon2 } from "poseidon-lite";

export const FRESHNESS_TREE_DEPTH = 16;

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

  constructor(depth: number = FRESHNESS_TREE_DEPTH) {
    this.depth = depth;
    this.zeros = zeroRoots(depth);
  }

  static identityCommitment(identitySecret: bigint): bigint {
    return poseidon1([identitySecret]);
  }

  static makeLeaf(identityCommitment: bigint, issuanceTime: bigint | number): bigint {
    return poseidon2([identityCommitment, BigInt(issuanceTime)]);
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
    let layer = this.leaves.slice();
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

export interface FreshnessProof {
  proofA: [bigint, bigint];
  proofB: [[bigint, bigint], [bigint, bigint]];
  proofC: [bigint, bigint];
  nullifier: bigint;
  merkleRoot: bigint;
  earliestAcceptable: bigint;
  scope: bigint;
}

export async function generateFreshnessProof(args: {
  identitySecret: bigint;
  issuanceTime: bigint;
  merkleProof: FreshnessMerkleProof;
  earliestAcceptable: bigint;
  scope: bigint;
  wasmUrl: string;
  zkeyUrl: string;
}): Promise<FreshnessProof> {
  // snarkjs is ESM in newer versions; dynamic import avoids SSR issues.
  const snarkjs = await import("snarkjs");

  const input = {
    identitySecret: args.identitySecret.toString(),
    issuanceTime: args.issuanceTime.toString(),
    pathElements: args.merkleProof.pathElements.map((x) => x.toString()),
    pathIndices: args.merkleProof.pathIndices.map((x) => x.toString()),
    merkleRoot: args.merkleProof.root.toString(),
    earliestAcceptable: args.earliestAcceptable.toString(),
    scope: args.scope.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    args.wasmUrl,
    args.zkeyUrl
  );

  const [nullifier, merkleRoot, earliestAcceptable, scope] = publicSignals.map(
    (s: string) => BigInt(s)
  );

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

/** Random 64-bit scalar for demo identity generation. */
export function randomSecret(): bigint {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  // Clamp to < BN254 scalar field; high bits zeroed is safe.
  arr[0] &= 0x1f;
  let r = 0n;
  for (const b of arr) r = (r << 8n) | BigInt(b);
  if (r === 0n) r = 1n;
  return r;
}
