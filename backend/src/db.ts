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
    tx_hash TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_requests(status, submitted_at);
  CREATE INDEX IF NOT EXISTS idx_kyc_commitment ON kyc_requests(identity_commitment);
  CREATE INDEX IF NOT EXISTS idx_kyc_wallet ON kyc_requests(wallet_address);

  CREATE TABLE IF NOT EXISTS proof_verifications (
    nullifier TEXT PRIMARY KEY,
    group_id INTEGER NOT NULL,
    verifier_address TEXT,
    block_number INTEGER NOT NULL,
    tx_hash TEXT NOT NULL,
    verified_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_proofs_group ON proof_verifications(group_id);
`);

export function getSyncState(key: string): string | null {
  const row = db.prepare("SELECT value FROM sync_state WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSyncState(key: string, value: string) {
  db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)").run(key, value);
}

export function insertCredential(
  groupId: number,
  commitment: string,
  block: number,
  tx: string
) {
  db.prepare(
    `INSERT OR IGNORE INTO credentials (group_id, identity_commitment, issued_at_block, issued_tx, active)
     VALUES (?, ?, ?, ?, 1)`
  ).run(groupId, commitment, block, tx);
}

export function revokeCredential(
  groupId: number,
  commitment: string,
  block: number,
  tx: string
) {
  db.prepare(
    `UPDATE credentials
     SET active = 0, revoked_at_block = ?, revoked_tx = ?
     WHERE group_id = ? AND identity_commitment = ?`
  ).run(block, tx, groupId, commitment);
}

export function getActiveMembers(groupId: number): string[] {
  const rows = db.prepare(
    `SELECT identity_commitment FROM credentials
     WHERE group_id = ? AND active = 1
     ORDER BY issued_at_block ASC`
  ).all(groupId) as { identity_commitment: string }[];
  return rows.map((r) => r.identity_commitment);
}

export function getGroupStats(groupId: number) {
  const row = db.prepare(
    `SELECT
       SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active_count,
       COUNT(*) AS total_issued,
       SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) AS total_revoked
     FROM credentials WHERE group_id = ?`
  ).get(groupId) as { active_count: number | null; total_issued: number | null; total_revoked: number | null };
  return {
    activeCount: row.active_count ?? 0,
    totalIssued: row.total_issued ?? 0,
    totalRevoked: row.total_revoked ?? 0,
  };
}

export function getGroupsForCommitment(commitment: string): number[] {
  const rows = db.prepare(
    `SELECT group_id FROM credentials WHERE identity_commitment = ? AND active = 1`
  ).all(commitment) as { group_id: number }[];
  return rows.map((r) => r.group_id);
}

export function getGlobalStats() {
  const active = db.prepare("SELECT COUNT(*) as c FROM credentials WHERE active = 1").get() as { c: number };
  const total = db.prepare("SELECT COUNT(*) as c FROM credentials").get() as { c: number };
  const groups = db.prepare("SELECT COUNT(DISTINCT group_id) as c FROM credentials").get() as { c: number };
  const kyc = db.prepare("SELECT COUNT(*) as c FROM kyc_requests").get() as { c: number };
  const kycPending = db.prepare("SELECT COUNT(*) as c FROM kyc_requests WHERE status = 'pending'").get() as { c: number };
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
}) {
  db.prepare(
    `INSERT INTO kyc_requests
     (id, identity_commitment, wallet_address, jurisdiction, credential_type, document_type, status, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(
    req.id,
    req.commitment,
    req.wallet.toLowerCase(),
    req.jurisdiction,
    req.credentialType,
    req.documentType || null,
    Date.now()
  );
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
  return db.prepare(
    "SELECT * FROM kyc_requests WHERE identity_commitment = ? ORDER BY submitted_at DESC LIMIT 1"
  ).get(commitment);
}

export function updateKYCStatus(
  id: string,
  status: "approved" | "rejected",
  reviewer: string,
  extras: { txHash?: string; rejectionReason?: string } = {}
) {
  db.prepare(
    `UPDATE kyc_requests
     SET status = ?, reviewed_at = ?, reviewed_by = ?, tx_hash = ?, rejection_reason = ?
     WHERE id = ?`
  ).run(
    status,
    Date.now(),
    reviewer.toLowerCase(),
    extras.txHash || null,
    extras.rejectionReason || null,
    id
  );
}
