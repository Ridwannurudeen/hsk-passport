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

  const proof = await generateProof(identity, group, message, scope);
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
