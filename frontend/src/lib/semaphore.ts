import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof, SemaphoreProof } from "@semaphore-protocol/proof";

const LEGACY_IDENTITY_KEY = "hsk-passport-identity";
const LEGACY_WALLET_KEY = "hsk-passport-identity-wallet";
const IDENTITIES_MAP_KEY = "hsk-passport-identities";
const ACTIVE_WALLET_KEY = "hsk-passport-active-wallet";
const SESSION_STORAGE_KEY = "hsk-passport-kyc-session";

type IdentityMap = Record<string, string>;

function readMap(): IdentityMap {
  try {
    const raw = localStorage.getItem(IDENTITIES_MAP_KEY);
    return raw ? (JSON.parse(raw) as IdentityMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: IdentityMap): void {
  localStorage.setItem(IDENTITIES_MAP_KEY, JSON.stringify(map));
}

/**
 * One-time migration: if a pre-multi-wallet identity exists, move it into the map
 * under its tagged wallet (or leave it as legacy if no tag).
 */
function migrateLegacy(): void {
  const legacy = localStorage.getItem(LEGACY_IDENTITY_KEY);
  if (!legacy) return;
  const legacyWallet = localStorage.getItem(LEGACY_WALLET_KEY)?.toLowerCase();
  if (legacyWallet) {
    const map = readMap();
    if (!map[legacyWallet]) map[legacyWallet] = legacy;
    writeMap(map);
  }
  localStorage.removeItem(LEGACY_IDENTITY_KEY);
  localStorage.removeItem(LEGACY_WALLET_KEY);
}

/** Save identity for a specific wallet, tagged so we can recover it next time that wallet connects. */
export function createIdentityFromSignature(signature: string, walletAddress: string): Identity {
  migrateLegacy();
  const identity = new Identity(signature);
  const addr = walletAddress.toLowerCase();
  const map = readMap();
  map[addr] = identity.export();
  writeMap(map);
  localStorage.setItem(ACTIVE_WALLET_KEY, addr);
  return identity;
}

/**
 * Load the identity for a specific wallet address, or null if none stored.
 * Side-effect: sets the active wallet so subsequent `loadIdentity()` (no-arg) returns the same one.
 */
export function loadIdentityForWallet(walletAddress: string): Identity | null {
  migrateLegacy();
  const addr = walletAddress.toLowerCase();
  const map = readMap();
  const stored = map[addr];
  if (!stored) return null;
  try {
    const id = Identity.import(stored);
    localStorage.setItem(ACTIVE_WALLET_KEY, addr);
    return id;
  } catch {
    return null;
  }
}

/**
 * Load whichever identity is currently active (set by last successful create/load-for-wallet).
 * Used by pages that don't have the wallet context yet (e.g. before MetaMask query finishes).
 */
export function loadIdentity(): Identity | null {
  migrateLegacy();
  const active = localStorage.getItem(ACTIVE_WALLET_KEY);
  if (!active) return null;
  return loadIdentityForWallet(active);
}

/** Wallet address of the currently active identity. */
export function loadIdentityWallet(): string | null {
  return localStorage.getItem(ACTIVE_WALLET_KEY)?.toLowerCase() || null;
}

/** Reset everything (all wallets' identities + KYC session). Rarely needed now that switching is automatic. */
export function clearIdentity(): void {
  localStorage.removeItem(IDENTITIES_MAP_KEY);
  localStorage.removeItem(ACTIVE_WALLET_KEY);
  localStorage.removeItem(LEGACY_IDENTITY_KEY);
  localStorage.removeItem(LEGACY_WALLET_KEY);
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

/** Remove just the identity for a specific wallet (leaves other wallets' identities intact). */
export function clearIdentityForWallet(walletAddress: string): void {
  const addr = walletAddress.toLowerCase();
  const map = readMap();
  delete map[addr];
  writeMap(map);
  const active = localStorage.getItem(ACTIVE_WALLET_KEY);
  if (active === addr) localStorage.removeItem(ACTIVE_WALLET_KEY);
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
