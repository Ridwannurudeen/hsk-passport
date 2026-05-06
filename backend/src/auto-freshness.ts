// v6 freshness leaf posting. Watches kyc_requests for approved rows that have a
// freshnessCommitment set, and writes Poseidon(freshnessCommitment, issuanceTime)
// to FreshnessRegistry so the user can later generate a freshness ZK proof.
//
// Authorization model: the issuer wallet (ISSUER_PRIVATE_KEY) must have been
// authorised on FreshnessRegistry for each credential group via owner action.
// On startup we check authorisation per group; unauthorised groups are skipped
// with a warning, never crash the backend.
//
// Restart safety: every successful post writes a freshness_leaves row. On
// startup we rebuild the in-memory Merkle tree from those rows so we never
// double-post and the next root we compute matches the on-chain currentRoot.

import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { poseidon2 } from "poseidon-lite";
import { CONFIG } from "./config.js";
import {
  getPendingFreshnessIssuances,
  insertFreshnessLeaf,
  getFreshnessLeaves,
  type FreshnessLeafRow,
} from "./db.js";

const REGISTRY_ABI = [
  "function groupIssuer(uint256, address) view returns (bool)",
  "function currentRoot(uint256) view returns (uint256)",
  "function leafCount(uint256) view returns (uint256)",
  "function addLeaf(uint256 groupId, uint256 leaf, uint256 newRoot)",
];

const POLL_INTERVAL_MS = 20_000;

const CREDENTIAL_TYPE_TO_GROUP: Record<string, number> = {
  KYCVerified: CONFIG.groups.KYC_VERIFIED,
  AccreditedInvestor: CONFIG.groups.ACCREDITED_INVESTOR,
  HKResident: CONFIG.groups.HK_RESIDENT,
};

// Pre-compute zero hashes for empty subtrees once — same algorithm as the
// frontend FreshnessTree and contracts/scripts/seed-freshness-demo.ts so the
// roots match byte-for-byte across implementations.
function computeZeroRoots(depth: number): bigint[] {
  const zeros: bigint[] = new Array(depth + 1);
  zeros[0] = 0n;
  for (let i = 1; i <= depth; i++) zeros[i] = poseidon2([zeros[i - 1], zeros[i - 1]]);
  return zeros;
}

const ZEROS = computeZeroRoots(CONFIG.freshnessTreeDepth);

function computeRoot(leaves: bigint[], depth: number): bigint {
  let layer = leaves.slice();
  for (let level = 0; level < depth; level++) {
    const next: bigint[] = [];
    const len = Math.max(layer.length, 1);
    for (let i = 0; i < len; i += 2) {
      const left = i < layer.length ? layer[i] : ZEROS[level];
      const right = i + 1 < layer.length ? layer[i + 1] : ZEROS[level];
      next.push(poseidon2([left, right]));
    }
    layer = next;
  }
  return layer[0] ?? ZEROS[depth];
}

interface GroupState {
  groupId: number;
  authorised: boolean;
  leaves: bigint[]; // in-memory mirror, indexed by leaf_index
}

export function makeFreshnessLeaf(freshnessCommitment: bigint, issuanceTime: bigint): bigint {
  return poseidon2([freshnessCommitment, issuanceTime]);
}

function getIssuerWallet(): Wallet | null {
  const pk = process.env.ISSUER_PRIVATE_KEY;
  if (!pk) {
    console.warn("[auto-freshness] ISSUER_PRIVATE_KEY not set — auto-freshness disabled");
    return null;
  }
  const provider = new JsonRpcProvider(CONFIG.rpcUrl);
  return new Wallet(pk, provider);
}

async function rebuildState(
  registry: Contract,
  wallet: Wallet,
): Promise<Map<number, GroupState>> {
  const state = new Map<number, GroupState>();
  for (const groupId of Object.values(CONFIG.groups)) {
    const rows = getFreshnessLeaves(groupId);
    const leaves = rows.map((r: FreshnessLeafRow) => BigInt(r.leaf));
    let authorised = false;
    try {
      authorised = await registry.groupIssuer(groupId, wallet.address);
    } catch (e) {
      console.error(
        `[auto-freshness] groupIssuer(${groupId}) check failed: ${(e as Error).message}`,
      );
    }
    state.set(groupId, { groupId, authorised, leaves });
    console.log(
      `[auto-freshness] group ${groupId}: ${leaves.length} leaves locally, authorised=${authorised}`,
    );
  }
  return state;
}

/** Validate the locally-recomputed root against the on-chain currentRoot for
 *  each group with leaves. If mismatch, log loudly and skip posting for that
 *  group — this is a "stop, don't make it worse" condition because posting a
 *  new root that doesn't extend the on-chain tree silently breaks everyone's
 *  proofs. */
async function reconcileRoots(registry: Contract, state: Map<number, GroupState>) {
  for (const groupState of state.values()) {
    if (groupState.leaves.length === 0) continue;
    const localRoot = computeRoot(groupState.leaves, CONFIG.freshnessTreeDepth);
    let onChainRoot: bigint;
    try {
      onChainRoot = BigInt(await registry.currentRoot(groupState.groupId));
    } catch (e) {
      console.error(
        `[auto-freshness] currentRoot(${groupState.groupId}) read failed: ${(e as Error).message}`,
      );
      groupState.authorised = false; // soft-disable until next reconcile
      continue;
    }
    if (onChainRoot !== localRoot) {
      console.error(
        `[auto-freshness] ROOT MISMATCH group ${groupState.groupId}: ` +
          `local=${localRoot.toString(16).slice(0, 16)} on-chain=${onChainRoot.toString(16).slice(0, 16)}. ` +
          "Refusing to post until resolved (likely DB stale or other writer active).",
      );
      groupState.authorised = false;
    }
  }
}

async function postLeaf(
  registry: Contract,
  groupState: GroupState,
  freshnessCommitment: bigint,
  issuanceTime: bigint,
): Promise<{ leaf: bigint; root: bigint; index: number; txHash: string }> {
  const leaf = makeFreshnessLeaf(freshnessCommitment, issuanceTime);
  const trial = [...groupState.leaves, leaf];
  const newRoot = computeRoot(trial, CONFIG.freshnessTreeDepth);

  const tx = await registry.addLeaf(groupState.groupId, leaf, newRoot);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`addLeaf tx ${tx.hash} reverted`);
  }

  // Only mutate in-memory state on confirmed success — keeps state aligned
  // with on-chain even if a tx is dropped or replaced.
  groupState.leaves.push(leaf);
  return {
    leaf,
    root: newRoot,
    index: groupState.leaves.length - 1,
    txHash: tx.hash,
  };
}

export function startAutoFreshness() {
  if (process.env.AUTO_FRESHNESS_DISABLE === "true") {
    console.log("[auto-freshness] Disabled via AUTO_FRESHNESS_DISABLE=true");
    return;
  }

  const wallet = getIssuerWallet();
  if (!wallet) return;
  const registry = new Contract(CONFIG.freshnessRegistry, REGISTRY_ABI, wallet);

  let state: Map<number, GroupState> | null = null;
  let running = false;

  async function bootstrap() {
    try {
      state = await rebuildState(registry, wallet!);
      await reconcileRoots(registry, state);
      console.log(
        `[auto-freshness] started; wallet=${wallet!.address} registry=${CONFIG.freshnessRegistry}`,
      );
    } catch (e) {
      console.error("[auto-freshness] bootstrap failed:", (e as Error).message);
      state = null;
    }
  }

  async function tick() {
    if (running) return;
    if (!state) {
      await bootstrap();
      if (!state) return;
    }
    running = true;
    try {
      const pending = getPendingFreshnessIssuances();
      for (const row of pending) {
        const groupId = CREDENTIAL_TYPE_TO_GROUP[row.credential_type];
        if (groupId === undefined) {
          console.warn(
            `[auto-freshness] unknown credential type "${row.credential_type}" on KYC ${row.id.slice(0, 8)}; skipping`,
          );
          continue;
        }
        const groupState = state.get(groupId);
        if (!groupState || !groupState.authorised) {
          // Don't spam — only log once per pending row that we're skipping due to
          // unauthorised group. The row stays pending and we'll try again next
          // tick once authorisation is granted.
          continue;
        }

        // Issuance time must align with what the verifier eventually checks.
        // We use reviewed_at (millis) as the canonical issuance moment because
        // that's when the credential entered the system; truncating to seconds
        // matches the circuit's unix-seconds representation.
        const issuanceTimeSec = row.reviewed_at
          ? BigInt(Math.floor(row.reviewed_at / 1000))
          : BigInt(Math.floor(Date.now() / 1000));

        try {
          const result = await postLeaf(
            registry,
            groupState,
            BigInt(row.freshness_commitment),
            issuanceTimeSec,
          );
          insertFreshnessLeaf({
            group_id: groupId,
            leaf_index: result.index,
            freshness_commitment: row.freshness_commitment,
            issuance_time: Number(issuanceTimeSec),
            leaf: result.leaf.toString(),
            root_after_insert: result.root.toString(),
            posted_tx: result.txHash,
            posted_at: Date.now(),
          });
          console.log(
            `[auto-freshness] group ${groupId} +leaf[${result.index}] tx=${result.txHash.slice(0, 12)}…`,
          );
        } catch (e) {
          const msg = (e as Error).message || "";
          console.error(
            `[auto-freshness] post failed group=${groupId} kyc=${row.id.slice(0, 8)}: ${msg.slice(0, 200)}`,
          );
          // Stop processing this tick on first failure so we don't burn through
          // gas on a chain-level problem (RPC down, gas spike, etc).
          break;
        }
      }
    } catch (e) {
      console.error("[auto-freshness] tick error:", (e as Error).message);
    } finally {
      running = false;
    }
  }

  bootstrap()
    .then(() => tick())
    .catch(() => {});
  setInterval(() => tick().catch(() => {}), POLL_INTERVAL_MS);
}

// -------------------------------------------------------------------------
// Public read helpers — exported so server.ts can serve `/api/freshness/*`
// without re-deriving in two places.
// -------------------------------------------------------------------------

export interface FreshnessTreeState {
  groupId: number;
  depth: number;
  leafCount: number;
  root: string;
  leaves: string[];
}

export function getTreeState(groupId: number): FreshnessTreeState {
  const rows = getFreshnessLeaves(groupId);
  const leaves = rows.map((r: FreshnessLeafRow) => BigInt(r.leaf));
  const root = computeRoot(leaves, CONFIG.freshnessTreeDepth);
  return {
    groupId,
    depth: CONFIG.freshnessTreeDepth,
    leafCount: leaves.length,
    root: root.toString(),
    leaves: rows.map((r: FreshnessLeafRow) => r.leaf),
  };
}
