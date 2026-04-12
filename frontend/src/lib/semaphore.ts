import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof, SemaphoreProof } from "@semaphore-protocol/proof";

const IDENTITY_STORAGE_KEY = "hsk-passport-identity";

export function createIdentityFromSignature(signature: string): Identity {
  const identity = new Identity(signature);
  localStorage.setItem(IDENTITY_STORAGE_KEY, identity.export());
  return identity;
}

export function loadIdentity(): Identity | null {
  const stored = localStorage.getItem(IDENTITY_STORAGE_KEY);
  if (!stored) return null;
  try {
    return Identity.import(stored);
  } catch {
    return null;
  }
}

export function clearIdentity(): void {
  localStorage.removeItem(IDENTITY_STORAGE_KEY);
}

export function getCommitment(identity: Identity): bigint {
  return identity.commitment;
}

function getMerkleDepth(memberCount: number): number {
  if (memberCount <= 2) return 1;
  return Math.max(1, Math.ceil(Math.log2(memberCount)));
}

export async function generateCredentialProof(
  identity: Identity,
  memberCommitments: bigint[],
  message: bigint | number,
  scope: bigint | number
): Promise<SemaphoreProof> {
  const group = new Group();
  for (const commitment of memberCommitments) {
    group.addMember(commitment);
  }

  // Use self-hosted artifacts to avoid external CDN fetch failures.
  // We host artifacts for depths 1-12 in /public/semaphore/.
  // Pick the smallest available depth >= needed.
  const needed = getMerkleDepth(memberCommitments.length);
  const available = [1, 2, 3, 4, 5, 6, 8, 10, 12];
  const depth = available.find((d) => d >= needed) ?? 12;

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const proof = await generateProof(identity, group, message, scope, depth, {
    wasm: `${origin}/semaphore/semaphore-${depth}.wasm`,
    zkey: `${origin}/semaphore/semaphore-${depth}.zkey`,
  });
  return proof;
}

export function formatProofForContract(proof: SemaphoreProof) {
  return {
    merkleTreeDepth: proof.merkleTreeDepth,
    merkleTreeRoot: proof.merkleTreeRoot,
    nullifier: proof.nullifier,
    message: proof.message,
    scope: proof.scope,
    points: proof.points,
  };
}

export { Identity, Group, type SemaphoreProof };
