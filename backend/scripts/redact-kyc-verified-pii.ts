/**
 * One-off: redact the commitment<->identity correlation for KYC-Verified rows.
 *
 * After the blind /claim migration, KYC-Verified credentials are issued through
 * the unlinkable voucher flow. Old `kyc_requests` rows still hold the correlating
 * PII: `wallet_address` and the Sumsub applicant id stashed in
 * `document_type = "sumsub:<id>"`. This nulls that link. `identity_commitment` is
 * kept (it is already public on-chain as a group member, so it leaks nothing new).
 *
 * `wallet_address` is NOT NULL in the schema, so it is set to the 'redacted'
 * sentinel rather than SQL NULL. Idempotent. Dry-run by default.
 *
 *   # match the systemd DB_PATH when running on the VPS:
 *   DB_PATH=/opt/hsk-passport/backend/hsk-passport.db npx tsx scripts/redact-kyc-verified-pii.ts          # dry run
 *   DB_PATH=/opt/hsk-passport/backend/hsk-passport.db npx tsx scripts/redact-kyc-verified-pii.ts --apply  # perform
 *
 * NOTE: this does not (and cannot) remove the matching record inside Sumsub, where
 * pre-migration applicants still carry externalUserId = commitment.
 */
import { db } from "../src/db.js";

const SENTINEL = "redacted";
const apply = process.argv.includes("--apply");

const WHERE =
  `credential_type = 'KYCVerified' ` +
  `AND (wallet_address != ? OR document_type IS NOT NULL)`;

const { n } = db
  .prepare(`SELECT COUNT(*) AS n FROM kyc_requests WHERE ${WHERE}`)
  .get(SENTINEL) as { n: number };

console.log(`KYC-Verified rows with correlating PII to redact: ${n}`);

if (n === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

if (!apply) {
  console.log(
    "Dry run. Re-run with --apply to redact wallet_address + document_type.",
  );
  process.exit(0);
}

const info = db
  .prepare(
    `UPDATE kyc_requests SET wallet_address = ?, document_type = NULL WHERE ${WHERE}`,
  )
  .run(SENTINEL, SENTINEL);

console.log(`Redacted ${info.changes} row(s).`);
