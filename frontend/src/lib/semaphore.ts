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

// Cache artifacts across calls
const artifactCache = new Map<number, { wasm: Uint8Array; zkey: Uint8Array }>();

async function fetchOne(url: string, label: string): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "force-cache" });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    throw new Error(`${label} fetch failed: ${msg} (url: ${url})`);
  }
  if (!res.ok) throw new Error(`${label} returned ${res.status} from ${url}`);
  try {
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    throw new Error(`${label} read body failed: ${msg}`);
  }
}

async function fetchArtifacts(depth: number): Promise<{ wasm: Uint8Array; zkey: Uint8Array }> {
  if (artifactCache.has(depth)) return artifactCache.get(depth)!;

  const wasm = await fetchOne(`/semaphore/semaphore-${depth}.wasm`, "WASM");
  const zkey = await fetchOne(`/semaphore/semaphore-${depth}.zkey`, "zkey");

  artifactCache.set(depth, { wasm, zkey });
  return { wasm, zkey };
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

  const needed = getMerkleDepth(memberCommitments.length);
  const available = [1, 2, 3, 4, 5, 6, 8, 10, 12];
  const depth = available.find((d) => d >= needed) ?? 12;

  // Fetch artifacts as Uint8Array and pass them directly.
  // This bypasses snarkjs/fastfile's process.browser check which fails in Next.js.
  const { wasm, zkey } = await fetchArtifacts(depth);

  // The SnarkArtifacts type says string, but fastfile accepts Uint8Array at runtime.
  // This is the only path that works in Next.js (bypasses broken process.browser check).
  const artifacts = { wasm, zkey } as unknown as { wasm: string; zkey: string };
  const proof = await generateProof(identity, group, message, scope, depth, artifacts);
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
