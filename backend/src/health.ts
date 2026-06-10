import { JsonRpcProvider, Wallet, formatEther } from "ethers";
import { CONFIG } from "./config.js";
import { db, getSyncState, getGlobalStats } from "./db.js";

// Thresholds — tuned to HashKey Chain ~3s blocks. >50 blocks behind = ~2.5min,
// which is well past any reasonable RPC hiccup; >5 blocks is the "fine, but
// something's wrong" warning band.
const LAG_OK_BLOCKS = 5;
const LAG_WARN_BLOCKS = 50;
const SYNC_OK_SEC = 60;
const SYNC_WARN_SEC = 5 * 60;

// Cache RPC head-block queries to avoid hammering the upstream RPC on every
// /api/healthz request (status pages and frontend banner poll regularly).
const HEAD_CACHE_TTL_MS = 5_000;
interface HeadCache {
  block: number;
  fetchedAt: number;
  ok: boolean;
  latencyMs: number;
  error: string | null;
}
const headCache = new Map<string, HeadCache>();

const testnetProvider = new JsonRpcProvider(CONFIG.rpcUrl);
const mainnetProvider = new JsonRpcProvider(CONFIG.mainnetRpcUrl);

// Issuer hot wallet gas monitoring. A drained issuer wallet silently stops
// credential and freshness issuance, so surface its balance as a health signal.
const ISSUER_BALANCE_WARN_ETH = 0.05;
const ISSUER_BALANCE_ERROR_ETH = 0.01;
const ISSUER_BALANCE_TTL_MS = 30_000;

const issuerAddress: string | null = (() => {
  const pk = process.env.ISSUER_PRIVATE_KEY;
  if (!pk) return null;
  try {
    return new Wallet(pk).address;
  } catch {
    return null;
  }
})();

interface IssuerBalance {
  configured: boolean;
  address: string | null;
  balanceWei: bigint;
  ok: boolean;
}
let issuerBalanceCache: {
  balanceWei: bigint;
  fetchedAt: number;
  ok: boolean;
} | null = null;

async function getIssuerBalance(): Promise<IssuerBalance> {
  if (!issuerAddress) {
    return { configured: false, address: null, balanceWei: 0n, ok: true };
  }
  const now = Date.now();
  if (
    issuerBalanceCache &&
    now - issuerBalanceCache.fetchedAt < ISSUER_BALANCE_TTL_MS
  ) {
    return {
      configured: true,
      address: issuerAddress,
      balanceWei: issuerBalanceCache.balanceWei,
      ok: issuerBalanceCache.ok,
    };
  }
  try {
    const balanceWei = await testnetProvider.getBalance(issuerAddress);
    issuerBalanceCache = { balanceWei, fetchedAt: Date.now(), ok: true };
    return { configured: true, address: issuerAddress, balanceWei, ok: true };
  } catch {
    // Keep the last known balance but flag the read as failed.
    const balanceWei = issuerBalanceCache?.balanceWei ?? 0n;
    issuerBalanceCache = { balanceWei, fetchedAt: Date.now(), ok: false };
    return { configured: true, address: issuerAddress, balanceWei, ok: false };
  }
}

function classifyIssuer(issuer: IssuerBalance): HealthStatus {
  if (!issuer.configured) return "ok"; // no issuer key on this node (e.g. read replica)
  if (!issuer.ok) return "warn"; // couldn't read balance — RPC blip, don't hard-fail
  const eth = Number(formatEther(issuer.balanceWei));
  if (eth < ISSUER_BALANCE_ERROR_ETH) return "error";
  if (eth < ISSUER_BALANCE_WARN_ETH) return "warn";
  return "ok";
}

async function getHead(
  name: "testnet" | "mainnet",
  provider: JsonRpcProvider,
): Promise<HeadCache> {
  const cached = headCache.get(name);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < HEAD_CACHE_TTL_MS) return cached;
  const start = now;
  try {
    const block = await provider.getBlockNumber();
    const entry: HeadCache = {
      block,
      fetchedAt: Date.now(),
      ok: true,
      latencyMs: Date.now() - start,
      error: null,
    };
    headCache.set(name, entry);
    return entry;
  } catch (e) {
    const entry: HeadCache = {
      block: cached?.block ?? 0,
      fetchedAt: Date.now(),
      ok: false,
      latencyMs: Date.now() - start,
      error: (e as Error).message.slice(0, 200),
    };
    headCache.set(name, entry);
    return entry;
  }
}

const PROCESS_STARTED_AT = Date.now();

export type HealthStatus = "ok" | "warn" | "error";

export interface HealthReport {
  ok: boolean;
  status: HealthStatus;
  ts: number;
  uptimeSec: number;
  indexer: {
    status: HealthStatus;
    lastIndexedBlock: number;
    headBlock: number;
    lagBlocks: number;
    lastSyncedAt: number | null;
    secondsSinceSync: number | null;
    lastError: string | null;
  };
  rpc: {
    testnet: {
      ok: boolean;
      headBlock: number;
      latencyMs: number;
      error: string | null;
    };
    mainnet: {
      ok: boolean;
      headBlock: number;
      latencyMs: number;
      error: string | null;
    };
  };
  db: {
    ok: boolean;
    activeCredentials: number;
    kycPending: number;
  };
  issuer: {
    status: HealthStatus;
    configured: boolean;
    address: string | null;
    balanceWei: string;
    balanceEth: number;
  };
}

function classify(
  lagBlocks: number,
  secondsSinceSync: number | null,
  lastError: string | null,
): HealthStatus {
  if (lastError) return "error";
  if (secondsSinceSync !== null && secondsSinceSync > SYNC_WARN_SEC)
    return "error";
  if (lagBlocks > LAG_WARN_BLOCKS) return "error";
  if (secondsSinceSync !== null && secondsSinceSync > SYNC_OK_SEC)
    return "warn";
  if (lagBlocks > LAG_OK_BLOCKS) return "warn";
  return "ok";
}

export async function buildHealthReport(): Promise<HealthReport> {
  const [testnetHead, mainnetHead, issuer] = await Promise.all([
    getHead("testnet", testnetProvider),
    getHead("mainnet", mainnetProvider),
    getIssuerBalance(),
  ]);
  const issuerStatus = classifyIssuer(issuer);

  let dbOk = true;
  let stats = {
    activeCredentials: 0,
    totalIssued: 0,
    activeGroups: 0,
    kycRequests: 0,
    kycPending: 0,
  };
  try {
    stats = getGlobalStats();
  } catch {
    dbOk = false;
  }

  const lastIndexedRaw = getSyncState("last_block");
  const lastIndexedBlock = lastIndexedRaw !== null ? Number(lastIndexedRaw) : 0;
  const lastSyncedAtRaw = getSyncState("last_synced_at");
  const lastSyncedAt =
    lastSyncedAtRaw !== null ? Number(lastSyncedAtRaw) : null;
  const lastErrorRaw = getSyncState("last_sync_error");
  // Indexer writes "" on success (we can't DELETE because getSyncState/setSyncState
  // are key-value with INSERT OR REPLACE). Treat empty as null for the report.
  const lastError =
    lastErrorRaw && lastErrorRaw.length > 0 ? lastErrorRaw : null;
  const secondsSinceSync =
    lastSyncedAt !== null
      ? Math.floor((Date.now() - lastSyncedAt) / 1000)
      : null;
  const lagBlocks = testnetHead.ok
    ? Math.max(0, testnetHead.block - lastIndexedBlock)
    : 0;

  const indexerStatus: HealthStatus = !testnetHead.ok
    ? "error"
    : classify(lagBlocks, secondsSinceSync, lastError);

  const baseStatus: HealthStatus =
    !dbOk || !testnetHead.ok
      ? "error"
      : indexerStatus === "error"
        ? "error"
        : indexerStatus === "warn"
          ? "warn"
          : "ok";
  const overallStatus: HealthStatus =
    baseStatus === "error" || issuerStatus === "error"
      ? "error"
      : baseStatus === "warn" || issuerStatus === "warn"
        ? "warn"
        : "ok";

  return {
    ok: overallStatus !== "error",
    status: overallStatus,
    ts: Date.now(),
    uptimeSec: Math.floor((Date.now() - PROCESS_STARTED_AT) / 1000),
    indexer: {
      status: indexerStatus,
      lastIndexedBlock,
      headBlock: testnetHead.block,
      lagBlocks,
      lastSyncedAt,
      secondsSinceSync,
      lastError,
    },
    rpc: {
      testnet: {
        ok: testnetHead.ok,
        headBlock: testnetHead.block,
        latencyMs: testnetHead.latencyMs,
        error: testnetHead.error,
      },
      mainnet: {
        ok: mainnetHead.ok,
        headBlock: mainnetHead.block,
        latencyMs: mainnetHead.latencyMs,
        error: mainnetHead.error,
      },
    },
    db: {
      ok: dbOk,
      activeCredentials: stats.activeCredentials,
      kycPending: stats.kycPending,
    },
    issuer: {
      status: issuerStatus,
      configured: issuer.configured,
      address: issuer.address,
      balanceWei: issuer.balanceWei.toString(),
      balanceEth: Number(formatEther(issuer.balanceWei)),
    },
  };
}

interface PerGroupRow {
  group_id: number;
  active: number;
}

export function buildPrometheusMetrics(report: HealthReport): string {
  const perGroup = db
    .prepare(
      `SELECT group_id, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active FROM credentials GROUP BY group_id`,
    )
    .all() as PerGroupRow[];

  const lines: string[] = [];
  const push = (
    help: string,
    type: string,
    name: string,
    value: number,
    labels = "",
  ) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
    lines.push(`${name}${labels} ${value}`);
  };

  push(
    "Time since backend process start",
    "counter",
    "hsk_passport_uptime_seconds",
    report.uptimeSec,
  );
  push(
    "Overall health: 0=ok, 1=warn, 2=error",
    "gauge",
    "hsk_passport_health_status",
    report.status === "ok" ? 0 : report.status === "warn" ? 1 : 2,
  );
  push(
    "Blocks the indexer is behind chain head",
    "gauge",
    "hsk_passport_indexer_lag_blocks",
    report.indexer.lagBlocks,
  );
  push(
    "Last block successfully indexed",
    "gauge",
    "hsk_passport_indexer_last_block",
    report.indexer.lastIndexedBlock,
  );
  push(
    "Seconds since last successful indexer sync",
    "gauge",
    "hsk_passport_indexer_seconds_since_sync",
    report.indexer.secondsSinceSync ?? -1,
  );
  push(
    "Whether the last sync errored (1) or succeeded (0)",
    "gauge",
    "hsk_passport_indexer_last_error",
    report.indexer.lastError ? 1 : 0,
  );
  push(
    "Testnet RPC reachable (1=ok, 0=down)",
    "gauge",
    "hsk_passport_rpc_testnet_up",
    report.rpc.testnet.ok ? 1 : 0,
  );
  push(
    "Testnet RPC last call latency (ms)",
    "gauge",
    "hsk_passport_rpc_testnet_latency_ms",
    report.rpc.testnet.latencyMs,
  );
  push(
    "Mainnet RPC reachable (1=ok, 0=down)",
    "gauge",
    "hsk_passport_rpc_mainnet_up",
    report.rpc.mainnet.ok ? 1 : 0,
  );
  push(
    "Mainnet RPC last call latency (ms)",
    "gauge",
    "hsk_passport_rpc_mainnet_latency_ms",
    report.rpc.mainnet.latencyMs,
  );
  push(
    "Pending KYC requests waiting for review",
    "gauge",
    "hsk_passport_kyc_pending",
    report.db.kycPending,
  );
  push(
    "Total active credentials across all groups",
    "gauge",
    "hsk_passport_active_credentials_total",
    report.db.activeCredentials,
  );
  push(
    "Issuer wallet configured on this node (1=yes, 0=no)",
    "gauge",
    "hsk_passport_issuer_configured",
    report.issuer.configured ? 1 : 0,
  );
  push(
    "Issuer hot-wallet native balance (ether)",
    "gauge",
    "hsk_passport_issuer_wallet_balance_eth",
    report.issuer.balanceEth,
  );
  push(
    "Issuer health: 0=ok, 1=warn (low/unreadable), 2=error (near-empty)",
    "gauge",
    "hsk_passport_issuer_status",
    report.issuer.status === "ok" ? 0 : report.issuer.status === "warn" ? 1 : 2,
  );

  // Per-group breakdown — one HELP/TYPE pair, then one line per group.
  lines.push(
    "# HELP hsk_passport_active_credentials Active credentials per group",
  );
  lines.push("# TYPE hsk_passport_active_credentials gauge");
  for (const r of perGroup) {
    lines.push(
      `hsk_passport_active_credentials{group_id="${r.group_id}"} ${r.active ?? 0}`,
    );
  }

  return lines.join("\n") + "\n";
}
