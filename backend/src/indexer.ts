import { JsonRpcProvider, Contract } from "ethers";
import { CONFIG } from "./config.js";
import { insertCredential, revokeCredential, getSyncState, setSyncState } from "./db.js";

const PASSPORT_ABI = [
  "event CredentialIssued(uint256 indexed groupId, uint256 indexed identityCommitment)",
  "event CredentialRevoked(uint256 indexed groupId, uint256 indexed identityCommitment)",
];

const provider = new JsonRpcProvider(CONFIG.rpcUrl);
const passport = new Contract(CONFIG.hskPassport, PASSPORT_ABI, provider);

async function syncRange(fromBlock: number, toBlock: number) {
  const issuedFilter = passport.filters.CredentialIssued();
  const revokedFilter = passport.filters.CredentialRevoked();

  const [issued, revoked] = await Promise.all([
    passport.queryFilter(issuedFilter, fromBlock, toBlock),
    passport.queryFilter(revokedFilter, fromBlock, toBlock),
  ]);

  for (const ev of issued) {
    const parsed = passport.interface.parseLog({ topics: [...ev.topics], data: ev.data });
    if (!parsed) continue;
    const groupId = Number(parsed.args.groupId);
    const commitment = parsed.args.identityCommitment.toString();
    insertCredential(groupId, commitment, ev.blockNumber, ev.transactionHash);
  }

  for (const ev of revoked) {
    const parsed = passport.interface.parseLog({ topics: [...ev.topics], data: ev.data });
    if (!parsed) continue;
    const groupId = Number(parsed.args.groupId);
    const commitment = parsed.args.identityCommitment.toString();
    revokeCredential(groupId, commitment, ev.blockNumber, ev.transactionHash);
  }

  return { issuedCount: issued.length, revokedCount: revoked.length };
}

async function syncInChunks(fromBlock: number, toBlock: number) {
  let issued = 0;
  let revoked = 0;
  for (let from = fromBlock; from <= toBlock; from += CONFIG.blockChunkSize) {
    const to = Math.min(from + CONFIG.blockChunkSize - 1, toBlock);
    const r = await syncRange(from, to);
    issued += r.issuedCount;
    revoked += r.revokedCount;
  }
  return { issuedCount: issued, revokedCount: revoked };
}

export async function runIndexerOnce() {
  const cursor = Number(getSyncState("last_block") ?? CONFIG.deployBlock);
  const latest = await provider.getBlockNumber();

  if (cursor >= latest) return { fromBlock: cursor, toBlock: latest, issued: 0, revoked: 0 };

  const r = await syncInChunks(cursor, latest);
  setSyncState("last_block", String(latest));
  return { fromBlock: cursor, toBlock: latest, issued: r.issuedCount, revoked: r.revokedCount };
}

export function startIndexer() {
  let running = false;

  async function loop() {
    if (running) return;
    running = true;
    try {
      const r = await runIndexerOnce();
      if (r.issued > 0 || r.revoked > 0) {
        console.log(`[indexer] blocks ${r.fromBlock}-${r.toBlock}: +${r.issued} issued, +${r.revoked} revoked`);
      }
    } catch (e) {
      console.error("[indexer] sync error:", (e as Error).message);
    } finally {
      running = false;
    }
  }

  loop().catch(() => {});
  setInterval(() => loop().catch(() => {}), CONFIG.pollIntervalMs);
  console.log(`[indexer] started, polling every ${CONFIG.pollIntervalMs}ms`);
}
