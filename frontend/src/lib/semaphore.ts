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

  // LeanIMT depth is computed from actual siblings, not member count ceiling.
  // Generate the Merkle proof first to find the EXACT depth needed.
  const leafIndex = group.indexOf(identity.commitment);
  if (leafIndex === -1) throw new Error("Identity not in group");
  const merkleProof = group.generateMerkleProof(leafIndex);
  const actualDepth = merkleProof.siblings.length || 1;

  // Available pre-hosted artifact depths; pick smallest >= actual.
  const available = [1, 2, 3, 4, 5, 6, 8, 10, 12];
  const depth = available.find((d) => d >= actualDepth) ?? 12;

  // Fetch artifacts as Uint8Array (bypasses snarkjs/fastfile's broken process.browser check).
  const { wasm, zkey } = await fetchArtifacts(depth);

  // The SnarkArtifacts type says string, but fastfile accepts Uint8Array at runtime.
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
