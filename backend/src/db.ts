import Database from "better-sqlite3";
import { CONFIG } from "./config.js";

export const db = new Database(CONFIG.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS credentials (
    group_id INTEGER NOT NULL,
    identity_commitment TEXT NOT NULL,
    issued_at_block INTEGER NOT NULL,
    issued_tx TEXT NOT NULL,
    revoked_at_block INTEGER,
    revoked_tx TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (group_id, identity_commitment)
  );

  CREATE INDEX IF NOT EXISTS idx_credentials_group_active
    ON credentials(group_id, active);

  CREATE INDEX IF NOT EXISTS idx_credentials_commitment
    ON credentials(identity_commitment);

  CREATE TABLE IF NOT EXISTS kyc_requests (
    id TEXT PRIMARY KEY,
    identity_commitment TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    jurisdiction TEXT NOT NULL,
    credential_type TEXT NOT NULL,
    document_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    submitted_at INTEGER NOT NULL,
    reviewed_at INTEGER,
    reviewed_by TEXT,
    rejection_reason TEXT,
    tx_hash TEXT,
    notify_email TEXT,
    notified_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_requests(status, submitted_at);
  CREATE INDEX IF NOT EXISTS idx_kyc_commitment ON kyc_requests(identity_commitment);
  CREATE INDEX IF NOT EXISTS idx_kyc_wallet ON kyc_requests(wallet_address);
`);

// Lightweight migration: add the email-notification + freshness columns if they
// don't exist yet (SQLite doesn't support ADD COLUMN IF NOT EXISTS).
for (const col of [
  ["notify_email", "TEXT"],
  ["notified_at", "INTEGER"],
  // freshness_commitment = Poseidon(freshnessSecret), bound to this KYC request.
  // Optional: only set when the frontend supports v6 freshness proofs. Stored as
  // a decimal-string bigint to match how Semaphore commitments are persisted.
  ["freshness_commitment", "TEXT"],
]) {
  try {
    db.exec(`ALTER TABLE kyc_requests ADD COLUMN ${col[0]} ${col[1]}`);
  } catch (e) {
    const msg = (e as Error).message || "";
    if (!msg.includes("duplicate column")) throw e;
  }
}

db.exec(`

  CREATE TABLE IF NOT EXISTS proof_verifications (
    nullifier TEXT PRIMARY KEY,
    group_id INTEGER NOT NULL,
    verifier_address TEXT,
    block_number INTEGER NOT NULL,
    tx_hash TEXT NOT NULL,
    verified_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_proofs_group ON proof_verifications(group_id);

  -- v6 freshness leaves: ordered append-only log of leaves the auto-freshness
  -- module has posted to FreshnessRegistry, one row per (group, leaf_index).
  -- Used to (a) avoid double-posting after restart, (b) reconstruct the per-user
  -- Merkle path the frontend needs for a freshness proof.
  CREATE TABLE IF NOT EXISTS freshness_leaves (
    group_id INTEGER NOT NULL,
    leaf_index INTEGER NOT NULL,
    freshness_commitment TEXT NOT NULL,
    issuance_time INTEGER NOT NULL,
    leaf TEXT NOT NULL,
    root_after_insert TEXT NOT NULL,
    posted_tx TEXT NOT NULL,
    posted_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, leaf_index)
  );

  CREATE INDEX IF NOT EXISTS idx_freshness_commitment
    ON freshness_leaves(freshness_commitment);

  -- Replay protection for Sumsub webhooks: one row per processed payload,
  -- keyed by the SHA-256 of the raw signed body. A replayed (byte-identical)
  -- delivery hashes to the same digest and is rejected before any side effect.
  CREATE TABLE IF NOT EXISTS webhook_events (
    digest TEXT PRIMARY KEY,
    received_at INTEGER NOT NULL
  );

  -- Blind-issuance voucher sessions (CRITICAL #2). Each row is a Sumsub session
  -- under a random externalUserId — deliberately NOT linked to any identity
  -- commitment, so the backend cannot map a credential to an applicant. The
  -- session is GREEN-gated at Sumsub; this table only enforces one-voucher-per-
  -- session: signing flips spent_at, and the flip is atomic (UPDATE ... WHERE
  -- spent_at IS NULL).
  CREATE TABLE IF NOT EXISTS voucher_sessions (
    session_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    spent_at INTEGER
  );
`);

export function getSyncState(key: string): string | null {
  const row = db
    .prepare("SELECT value FROM sync_state WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSyncState(key: string, value: string) {
  db.prepare(
    "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",
  ).run(key, value);
}

export function insertCredential(
  groupId: number,
  commitment: string,
  block: number,
  tx: string,
) {
  db.prepare(
    `INSERT OR IGNORE INTO credentials (group_id, identity_commitment, issued_at_block, issued_tx, active)
     VALUES (?, ?, ?, ?, 1)`,
  ).run(groupId, commitment, block, tx);
}

export function revokeCredential(
  groupId: number,
  commitment: string,
  block: number,
  tx: string,
) {
  db.prepare(
    `UPDATE credentials
     SET active = 0, revoked_at_block = ?, revoked_tx = ?
     WHERE group_id = ? AND identity_commitment = ?`,
  ).run(block, tx, groupId, commitment);
}

export function getActiveMembers(groupId: number): string[] {
  const rows = db
    .prepare(
      `SELECT identity_commitment FROM credentials
     WHERE group_id = ? AND active = 1
     ORDER BY issued_at_block ASC`,
    )
    .all(groupId) as { identity_commitment: string }[];
  return rows.map((r) => r.identity_commitment);
}

export function getGroupStats(groupId: number) {
  const row = db
    .prepare(
      `SELECT
       SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active_count,
       COUNT(*) AS total_issued,
       SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) AS total_revoked
     FROM credentials WHERE group_id = ?`,
    )
    .get(groupId) as {
    active_count: number | null;
    total_issued: number | null;
    total_revoked: number | null;
  };
  return {
    activeCount: row.active_count ?? 0,
    totalIssued: row.total_issued ?? 0,
    totalRevoked: row.total_revoked ?? 0,
  };
}

export function getGroupsForCommitment(commitment: string): number[] {
  const rows = db
    .prepare(
      `SELECT group_id FROM credentials WHERE identity_commitment = ? AND active = 1`,
    )
    .all(commitment) as { group_id: number }[];
  return rows.map((r) => r.group_id);
}

export function getGlobalStats() {
  const active = db
    .prepare("SELECT COUNT(*) as c FROM credentials WHERE active = 1")
    .get() as { c: number };
  const total = db.prepare("SELECT COUNT(*) as c FROM credentials").get() as {
    c: number;
  };
  const groups = db
    .prepare("SELECT COUNT(DISTINCT group_id) as c FROM credentials")
    .get() as { c: number };
  const kyc = db.prepare("SELECT COUNT(*) as c FROM kyc_requests").get() as {
    c: number;
  };
  const kycPending = db
    .prepare("SELECT COUNT(*) as c FROM kyc_requests WHERE status = 'pending'")
    .get() as { c: number };
  return {
    activeCredentials: active.c,
    totalIssued: total.c,
    activeGroups: groups.c,
    kycRequests: kyc.c,
    kycPending: kycPending.c,
  };
}

export function insertKYCRequest(req: {
  id: string;
  commitment: string;
  wallet: string;
  jurisdiction: string;
  credentialType: string;
  documentType?: string;
  notifyEmail?: string;
  freshnessCommitment?: string;
}) {
  db.prepare(
    `INSERT INTO kyc_requests
     (id, identity_commitment, wallet_address, jurisdiction, credential_type, document_type, status, submitted_at, notify_email, freshness_commitment)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
  ).run(
    req.id,
    req.commitment,
    req.wallet.toLowerCase(),
    req.jurisdiction,
    req.credentialType,
    req.documentType || null,
    Date.now(),
    req.notifyEmail || null,
    req.freshnessCommitment || null,
  );
}

/** Update the freshness commitment on an existing pending request — the user
 *  may have generated their freshness identity after the initial submission
 *  (e.g. between the Sumsub init call and the Sumsub webhook firing). */
export function setFreshnessCommitment(
  id: string,
  freshnessCommitment: string,
) {
  db.prepare(
    "UPDATE kyc_requests SET freshness_commitment = ? WHERE id = ? AND freshness_commitment IS NULL",
  ).run(freshnessCommitment, id);
}

export function markKYCNotified(id: string) {
  // Clear notify_email once the notification has been sent — the address is no
  // longer needed and dropping it minimises PII retained against a commitment.
  db.prepare(
    "UPDATE kyc_requests SET notified_at = ?, notify_email = NULL WHERE id = ?",
  ).run(Date.now(), id);
}

/**
 * Record a processed webhook by raw-body digest. Returns true if this is the
 * first time we've seen it (caller should process), false if it's a replay or
 * duplicate delivery (caller should skip).
 */
export function recordWebhookEvent(digest: string): boolean {
  const res = db
    .prepare(
      "INSERT OR IGNORE INTO webhook_events (digest, received_at) VALUES (?, ?)",
    )
    .run(digest, Date.now());
  return res.changes > 0;
}

export function getKYCQueue(status?: string) {
  const query = status
    ? "SELECT * FROM kyc_requests WHERE status = ? ORDER BY submitted_at DESC LIMIT 100"
    : "SELECT * FROM kyc_requests ORDER BY submitted_at DESC LIMIT 100";
  const rows = status ? db.prepare(query).all(status) : db.prepare(query).all();
  return rows;
}

export function getKYCRequest(id: string) {
  return db.prepare("SELECT * FROM kyc_requests WHERE id = ?").get(id);
}

export function getKYCByCommitment(commitment: string) {
  return db
    .prepare(
      "SELECT * FROM kyc_requests WHERE identity_commitment = ? ORDER BY submitted_at DESC LIMIT 1",
    )
    .get(commitment);
}

export function updateKYCStatus(
  id: string,
  status: "approved" | "rejected",
  reviewer: string,
  extras: { txHash?: string; rejectionReason?: string } = {},
) {
  db.prepare(
    `UPDATE kyc_requests
     SET status = ?, reviewed_at = ?, reviewed_by = ?, tx_hash = ?, rejection_reason = ?
     WHERE id = ?`,
  ).run(
    status,
    Date.now(),
    reviewer.toLowerCase(),
    extras.txHash || null,
    extras.rejectionReason || null,
    id,
  );
}

// -------------------------------------------------------------------------
// Blind-issuance voucher sessions
// -------------------------------------------------------------------------

/** Record a freshly-created voucher session (random sessionId, no commitment). */
export function createVoucherSession(sessionId: string) {
  db.prepare(
    "INSERT OR IGNORE INTO voucher_sessions (session_id, created_at) VALUES (?, ?)",
  ).run(sessionId, Date.now());
}

export function getVoucherSession(
  sessionId: string,
):
  | { session_id: string; created_at: number; spent_at: number | null }
  | undefined {
  return db
    .prepare("SELECT * FROM voucher_sessions WHERE session_id = ?")
    .get(sessionId) as
    | { session_id: string; created_at: number; spent_at: number | null }
    | undefined;
}

/**
 * Atomically mark a session spent. Returns true only on the transition from
 * unspent → spent for a session we created — so a second voucher request for
 * the same session (or an unknown session) returns false and signs nothing.
 */
export function spendVoucherSession(sessionId: string): boolean {
  const res = db
    .prepare(
      "UPDATE voucher_sessions SET spent_at = ? WHERE session_id = ? AND spent_at IS NULL",
    )
    .run(Date.now(), sessionId);
  return res.changes > 0;
}

// -------------------------------------------------------------------------
// v6 freshness leaves
// -------------------------------------------------------------------------

export interface FreshnessLeafRow {
  group_id: number;
  leaf_index: number;
  freshness_commitment: string;
  issuance_time: number;
  leaf: string;
  root_after_insert: string;
  posted_tx: string;
  posted_at: number;
}

/** All approved KYC rows that have a freshness commitment but no leaf posted yet. */
export function getPendingFreshnessIssuances(): {
  id: string;
  freshness_commitment: string;
  credential_type: string;
  reviewed_at: number | null;
  tx_hash: string | null;
}[] {
  return db
    .prepare(
      `SELECT k.id, k.freshness_commitment, k.credential_type, k.reviewed_at, k.tx_hash
       FROM kyc_requests k
       WHERE k.status = 'approved'
         AND k.freshness_commitment IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM freshness_leaves f
           WHERE f.freshness_commitment = k.freshness_commitment
         )
       ORDER BY k.reviewed_at ASC`,
    )
    .all() as {
    id: string;
    freshness_commitment: string;
    credential_type: string;
    reviewed_at: number | null;
    tx_hash: string | null;
  }[];
}

export function insertFreshnessLeaf(row: FreshnessLeafRow) {
  db.prepare(
    `INSERT INTO freshness_leaves
     (group_id, leaf_index, freshness_commitment, issuance_time, leaf, root_after_insert, posted_tx, posted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.group_id,
    row.leaf_index,
    row.freshness_commitment,
    row.issuance_time,
    row.leaf,
    row.root_after_insert,
    row.posted_tx,
    row.posted_at,
  );
}

/** All leaves for a group, in insertion order. Used to rebuild the in-memory
 *  Merkle tree on backend startup, and to serve `/api/freshness/state/:groupId`. */
export function getFreshnessLeaves(groupId: number): FreshnessLeafRow[] {
  return db
    .prepare(
      "SELECT * FROM freshness_leaves WHERE group_id = ? ORDER BY leaf_index ASC",
    )
    .all(groupId) as FreshnessLeafRow[];
}

/** Find a user's freshness leaf by their commitment. */
export function getFreshnessLeafByCommitment(
  freshnessCommitment: string,
): FreshnessLeafRow | undefined {
  return db
    .prepare("SELECT * FROM freshness_leaves WHERE freshness_commitment = ?")
    .get(freshnessCommitment) as FreshnessLeafRow | undefined;
}

export function getFreshnessLeafCount(groupId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM freshness_leaves WHERE group_id = ?")
    .get(groupId) as { c: number };
  return row.c;
}
