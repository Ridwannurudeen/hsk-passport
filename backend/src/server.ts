import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "crypto";
import { verifyMessage, JsonRpcProvider, Contract } from "ethers";
import { CONFIG } from "./config.js";
import {
  getActiveMembers,
  getGroupStats,
  getGroupsForCommitment,
  getGlobalStats,
  insertKYCRequest,
  getKYCQueue,
  getKYCRequest,
  getKYCByCommitment,
  updateKYCStatus,
} from "./db.js";
import { startIndexer } from "./indexer.js";
import { startAutoIssuer } from "./auto-issuer.js";
import {
  sumsubConfig,
  createApplicant,
  getApplicantByExternalId,
  getApplicantInfo,
  generateAccessToken,
  verifyWebhookSignature,
  type SumsubApplicant,
} from "./sumsub.js";
import { emailConfig, notifyCredentialApproved, notifyCredentialRejected } from "./notify.js";
import { markKYCNotified } from "./db.js";

const app = Fastify({ logger: { level: "info" } });

// Capture the raw request body for HMAC signature verification on webhook routes.
// Fastify normally parses JSON before handlers run — that parsed-then-restringified body
// does not byte-match the original, which breaks HMAC signatures (audit finding).
app.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (req, body, done) => {
    (req as unknown as { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      done(null, body.length === 0 ? {} : JSON.parse((body as Buffer).toString("utf8")));
    } catch (e) {
      done(e as Error, undefined);
    }
  }
);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  "https://hskpassport.gudman.xyz,http://localhost:3000,http://localhost:3001"
).split(",").map((s) => s.trim()).filter(Boolean);

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl, server-to-server
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"), false);
  },
  credentials: false,
});

app.get("/health", async () => ({
  status: "ok",
  timestamp: Date.now(),
  chainId: CONFIG.chainId,
  contract: CONFIG.hskPassport,
}));

app.get("/api/groups/:groupId/members", async (request, reply) => {
  const { groupId } = request.params as { groupId: string };
  const gid = Number(groupId);
  if (!Number.isInteger(gid) || gid < 0) {
    reply.code(400);
    return { error: "invalid groupId" };
  }
  const members = getActiveMembers(gid);
  return { groupId: gid, members, count: members.length };
});

app.get("/api/groups/:groupId/stats", async (request) => {
  const { groupId } = request.params as { groupId: string };
  const gid = Number(groupId);
  return { groupId: gid, ...getGroupStats(gid) };
});

app.get("/api/credentials/:commitment", async (request) => {
  const { commitment } = request.params as { commitment: string };
  return { commitment, groups: getGroupsForCommitment(commitment) };
});

app.get("/api/stats/global", async () => {
  return getGlobalStats();
});

// ================================================================
// KYC workflow
// ================================================================

app.post("/api/kyc/submit", async (request, reply) => {
  const body = request.body as {
    commitment?: string;
    wallet?: string;
    jurisdiction?: string;
    credentialType?: string;
    documentType?: string;
    notifyEmail?: string;
  };

  if (!body.commitment || !body.wallet || !body.jurisdiction || !body.credentialType) {
    reply.code(400);
    return { error: "missing required fields: commitment, wallet, jurisdiction, credentialType" };
  }
  if (!/^\d+$/.test(body.commitment) || body.commitment.length > 80) {
    reply.code(400);
    return { error: "commitment must be a numeric string (Semaphore identity commitment)" };
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(body.wallet)) {
    reply.code(400);
    return { error: "wallet must be a 0x-prefixed 20-byte hex address" };
  }
  if (body.jurisdiction.length > 32 || body.credentialType.length > 40) {
    reply.code(400);
    return { error: "jurisdiction/credentialType too long" };
  }
  if (body.notifyEmail && (body.notifyEmail.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.notifyEmail))) {
    reply.code(400);
    return { error: "notifyEmail is not a valid email address" };
  }

  // Check for existing pending request
  const existing = getKYCByCommitment(body.commitment) as any;
  if (existing && existing.status === "pending") {
    return { id: existing.id, status: "pending", message: "already submitted" };
  }

  const id = randomUUID();
  insertKYCRequest({
    id,
    commitment: body.commitment,
    wallet: body.wallet,
    jurisdiction: body.jurisdiction,
    credentialType: body.credentialType,
    documentType: body.documentType,
    notifyEmail: body.notifyEmail,
  });

  return { id, status: "pending" };
});

interface KYCRow {
  id: string;
  identity_commitment: string;
  wallet_address: string;
  jurisdiction: string;
  credential_type: string;
  document_type: string | null;
  status: string;
  submitted_at: number;
  reviewed_at: number | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  tx_hash: string | null;
}

/** Strip personally identifiable fields from a KYC row for unauthenticated reads. */
function redactKYC(row: KYCRow) {
  return {
    id: row.id,
    identity_commitment: row.identity_commitment,
    credential_type: row.credential_type,
    document_type: row.document_type,
    status: row.status,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    tx_hash: row.tx_hash,
    // wallet_address, jurisdiction, reviewed_by, rejection_reason withheld
  };
}

// Per-signature replay cache. Key = `${addr}:${nonce}`. Within the 5-min window, a signed
// read header can only be used once. Entries are GC'd by the age check on read.
const usedIssuerNonces = new Map<string, number>();
const NONCE_WINDOW_MS = 5 * 60_000;

function gcNonces(now: number) {
  if (usedIssuerNonces.size < 4096) return;
  for (const [k, ts] of usedIssuerNonces) {
    if (now - ts > NONCE_WINDOW_MS) usedIssuerNonces.delete(k);
  }
}

/**
 * Verify issuer authentication from request headers.
 * Required headers: x-issuer-addr, x-issuer-sig, x-issuer-nonce
 * Signed payload: "HSK Passport issuer read at <nonce>"
 * Each (address, nonce) pair can be used at most once within a 5-minute window.
 */
async function authenticateIssuer(request: { headers: Record<string, string | string[] | undefined> }): Promise<boolean> {
  const addr = request.headers["x-issuer-addr"] as string | undefined;
  const sig = request.headers["x-issuer-sig"] as string | undefined;
  const nonceRaw = request.headers["x-issuer-nonce"] as string | undefined;
  if (!addr || !sig || !nonceRaw) return false;
  const nonce = parseInt(nonceRaw, 10);
  if (!Number.isFinite(nonce) || nonce <= 0) return false;
  const now = Date.now();
  const age = now - nonce;
  if (age < 0 || age > NONCE_WINDOW_MS) return false;

  const normalizedAddr = addr.toLowerCase();
  const key = `${normalizedAddr}:${nonce}`;
  if (usedIssuerNonces.has(key)) return false; // replay
  gcNonces(now);

  const message = `HSK Passport issuer read at ${nonce}`;
  let recovered: string;
  try {
    recovered = verifyMessage(message, sig);
  } catch {
    return false;
  }
  if (recovered.toLowerCase() !== normalizedAddr) return false;

  const provider = new JsonRpcProvider(CONFIG.rpcUrl);
  const passport = new Contract(CONFIG.hskPassport, PASSPORT_READ_ABI, provider);
  let isApproved: boolean;
  try {
    isApproved = await passport.approvedIssuers(recovered);
  } catch {
    return false;
  }
  if (!isApproved) return false;

  // Success — burn the nonce so it cannot be replayed.
  usedIssuerNonces.set(key, now);
  return true;
}

app.get("/api/kyc/queue", async (request) => {
  const { status } = request.query as { status?: string };
  const queue = getKYCQueue(status) as KYCRow[];
  const isIssuer = await authenticateIssuer(request);
  if (!isIssuer) {
    return {
      queue: queue.map(redactKYC),
      count: queue.length,
      authenticated: false,
      note: "Wallet/jurisdiction/reviewer fields withheld. Sign 'HSK Passport issuer read at <timestamp>' and send x-issuer-addr/x-issuer-sig/x-issuer-nonce headers for full access.",
    };
  }
  return { queue, count: queue.length, authenticated: true };
});

app.get("/api/kyc/status/:commitment", async (request) => {
  const { commitment } = request.params as { commitment: string };
  const req = getKYCByCommitment(commitment) as KYCRow | undefined;
  if (!req) return { status: "none" };
  const isIssuer = await authenticateIssuer(request);
  return isIssuer ? req : redactKYC(req);
});

app.get("/api/kyc/request/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const req = getKYCRequest(id) as KYCRow | undefined;
  if (!req) {
    reply.code(404);
    return { error: "not found" };
  }
  const isIssuer = await authenticateIssuer(request);
  if (!isIssuer) {
    reply.code(401);
    return { error: "issuer authentication required for per-request access" };
  }
  return req;
});

// ================================================================
// Authenticated review — requires wallet-signed message from approved issuer
// ================================================================

const PASSPORT_READ_ABI = [
  "function approvedIssuers(address) view returns (bool)",
];

async function verifyIssuerSignature(
  reviewer: string,
  requestId: string,
  action: string,
  signature: string,
  nonce: number
): Promise<boolean> {
  // Signature payload must match exactly what the reviewer signed on the client.
  // Include a nonce (timestamp) to prevent replay.
  const age = Date.now() - nonce;
  if (age < 0 || age > 5 * 60_000) return false; // 5 minute window

  const message = `HSK Passport review: ${action} request ${requestId} at ${nonce}`;
  try {
    const recovered = verifyMessage(message, signature);
    if (recovered.toLowerCase() !== reviewer.toLowerCase()) return false;
  } catch {
    return false;
  }

  // Verify recovered address is an approved issuer on-chain
  const provider = new JsonRpcProvider(CONFIG.rpcUrl);
  const passport = new Contract(CONFIG.hskPassport, PASSPORT_READ_ABI, provider);
  try {
    const isApproved = await passport.approvedIssuers(reviewer);
    return isApproved;
  } catch {
    return false;
  }
}

app.post("/api/kyc/review", async (request, reply) => {
  const body = request.body as {
    id?: string;
    reviewer?: string;
    action?: "approve" | "reject";
    signature?: string;
    nonce?: number;
    txHash?: string;
    rejectionReason?: string;
  };

  if (!body.id || !body.reviewer || !body.action || !body.signature || !body.nonce) {
    reply.code(400);
    return {
      error: "missing required fields: id, reviewer, action, signature, nonce. Reviewer must sign: 'HSK Passport review: <action> request <id> at <nonce>'",
    };
  }

  // Reject untrusted signatures
  const ok = await verifyIssuerSignature(
    body.reviewer,
    body.id,
    body.action,
    body.signature,
    body.nonce
  );
  if (!ok) {
    reply.code(401);
    return { error: "invalid signature or reviewer is not an approved issuer" };
  }

  const req = getKYCRequest(body.id) as { status?: string } | undefined;
  if (!req) {
    reply.code(404);
    return { error: "request not found" };
  }

  if (req.status !== "pending") {
    reply.code(409);
    return { error: `already ${req.status}` };
  }

  if (body.action === "approve") {
    updateKYCStatus(body.id, "approved", body.reviewer, { txHash: body.txHash });
  } else {
    updateKYCStatus(body.id, "rejected", body.reviewer, { rejectionReason: body.rejectionReason });
  }

  return { id: body.id, status: body.action === "approve" ? "approved" : "rejected" };
});

// ================================================================
// Sumsub integration — real KYC verification flow
// ================================================================

// Config check endpoint — frontend uses this to decide whether to show Sumsub
app.get("/api/kyc/sumsub/config", async () => {
  return {
    enabled: sumsubConfig.configured,
    levelName: sumsubConfig.levelName,
  };
});

/**
 * Initialize a Sumsub applicant and return a short-lived access token
 * that the frontend WebSDK uses to render the verification flow.
 *
 * Uses the user's Semaphore identity commitment as externalUserId so
 * one credential = one applicant = one on-chain commitment.
 */
app.post("/api/kyc/sumsub/init", async (request, reply) => {
  if (!sumsubConfig.configured) {
    reply.code(501);
    return { error: "Sumsub not configured on this server" };
  }

  const body = request.body as { commitment?: string; notifyEmail?: string; country?: string };
  if (!body.commitment || !/^\d+$/.test(body.commitment)) {
    reply.code(400);
    return { error: "missing or invalid commitment (must be numeric string)" };
  }
  if (body.notifyEmail && (body.notifyEmail.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.notifyEmail))) {
    reply.code(400);
    return { error: "notifyEmail is not a valid email address" };
  }
  if (body.country && !/^[A-Z]{3}$/.test(body.country)) {
    reply.code(400);
    return { error: "country must be a 3-letter uppercase ISO 3166-1 alpha-3 code" };
  }

  try {
    // Create or fetch applicant for this commitment. Country, if provided, seeds
    // Sumsub's fixedInfo so the WebSDK shows docs for the right jurisdiction
    // regardless of the applicant's IP geolocation.
    let applicant = await getApplicantByExternalId(body.commitment);
    if (!applicant) {
      applicant = await createApplicant(body.commitment, body.country);
    }

    // If user provided an email and we haven't stored a request for this commitment yet,
    // create a placeholder so the webhook can find the email later.
    if (body.notifyEmail) {
      const existing = getKYCByCommitment(body.commitment) as { id?: string; notify_email?: string } | undefined;
      if (!existing) {
        insertKYCRequest({
          id: randomUUID(),
          commitment: body.commitment,
          wallet: "sumsub-pending",
          jurisdiction: "PENDING",
          credentialType: "KYCVerified",
          documentType: `sumsub:${(applicant.id || "").slice(0, 10)}`,
          notifyEmail: body.notifyEmail,
        });
      }
    }

    // Generate fresh access token for the Web SDK
    const access = await generateAccessToken(body.commitment);

    return {
      applicantId: applicant.id,
      externalUserId: applicant.externalUserId,
      accessToken: access.token,
      levelName: sumsubConfig.levelName,
      reviewStatus: applicant.review?.reviewStatus || "init",
      reviewAnswer: applicant.review?.reviewResult?.reviewAnswer || null,
    };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[sumsub] init error:", msg);
    reply.code(500);
    return { error: msg.slice(0, 300) };
  }
});

/**
 * Poll Sumsub for an applicant's current status.
 * Frontend calls this after Web SDK completes to check if the review passed.
 */
app.get("/api/kyc/sumsub/status/:commitment", async (request, reply) => {
  if (!sumsubConfig.configured) {
    reply.code(501);
    return { error: "Sumsub not configured on this server" };
  }

  const { commitment } = request.params as { commitment: string };
  const applicant = await getApplicantByExternalId(commitment);
  if (!applicant) return { status: "none" };

  return {
    applicantId: applicant.id,
    reviewStatus: applicant.review?.reviewStatus || "init",
    reviewAnswer: applicant.review?.reviewResult?.reviewAnswer || null,
    rejectLabels: applicant.review?.reviewResult?.rejectLabels || [],
  };
});

/**
 * Return the verified fields extracted by Sumsub for a given commitment.
 * Live proxy — we do not store this data on our side.
 */
app.get("/api/kyc/sumsub/data/:commitment", async (request, reply) => {
  if (!sumsubConfig.configured) {
    reply.code(501);
    return { error: "Sumsub not configured on this server" };
  }

  const { commitment } = request.params as { commitment: string };
  const applicant = await getApplicantByExternalId(commitment);
  if (!applicant) return { status: "none" };

  const reviewAnswer = applicant.review?.reviewResult?.reviewAnswer || null;
  if (reviewAnswer !== "GREEN") {
    return {
      applicantId: applicant.id,
      reviewStatus: applicant.review?.reviewStatus || "init",
      reviewAnswer,
      idDocs: [],
    };
  }

  const info = await getApplicantInfo(applicant.id);
  return {
    applicantId: applicant.id,
    reviewStatus: applicant.review?.reviewStatus || "completed",
    reviewAnswer,
    idDocs: info?.idDocs || [],
  };
});

/**
 * Sumsub webhook receiver. Verifies HMAC signature, then handles the event.
 * On GREEN (approved) result, the auto-issuer will pick up the pending KYC
 * request and issue credentials on-chain.
 */
app.post("/api/kyc/sumsub/webhook", async (request, reply) => {
  const raw = (request as unknown as { rawBody?: Buffer }).rawBody;
  if (!raw) {
    reply.code(400);
    return { error: "raw body unavailable" };
  }
  const providedSig = (request.headers["x-payload-digest"] as string) || "";
  const algo = (request.headers["x-payload-digest-alg"] as string) || "HMAC_SHA256_HEX";

  if (!verifyWebhookSignature(raw, providedSig, algo)) {
    reply.code(401);
    return { error: "invalid webhook signature" };
  }

  const event = request.body as {
    type?: string;
    applicantId?: string;
    externalUserId?: string;
    reviewStatus?: string;
    reviewResult?: { reviewAnswer?: string };
  };

  console.log("[sumsub] webhook:", event.type, event.externalUserId, event.reviewStatus, event.reviewResult?.reviewAnswer);

  // Handle applicantReviewed: GREEN → auto-issue + email; RED → email rejection
  if (event.type === "applicantReviewed" && event.externalUserId) {
    const applicant = await getApplicantByExternalId(event.externalUserId);
    const answer = applicant?.review?.reviewResult?.reviewAnswer;
    const existing = getKYCByCommitment(event.externalUserId) as
      | { id?: string; status?: string; notify_email?: string | null; tx_hash?: string | null; credential_type?: string }
      | undefined;

    if (answer === "GREEN") {
      // Make sure the auto-issuer has a record
      if (!existing) {
        insertKYCRequest({
          id: randomUUID(),
          commitment: event.externalUserId,
          wallet: "sumsub-verified",
          jurisdiction: "UNKNOWN",
          credentialType: "KYCVerified",
          documentType: "sumsub:" + (applicant?.id || "").slice(0, 10),
        });
      }
      // Send approval email if we have one stored. Note: tx_hash will be filled in by
      // the auto-issuer after on-chain issuance — we send a "verified" email now
      // and rely on the user dashboard for the final tx link if email arrives first.
      if (existing?.notify_email) {
        const result = await notifyCredentialApproved({
          email: existing.notify_email,
          credentialType: existing.credential_type || "KYCVerified",
          txHash: existing.tx_hash || null,
          commitment: event.externalUserId,
        });
        if (result.ok && existing.id) markKYCNotified(existing.id);
        else if (!result.ok) console.warn("[notify] approval email failed:", result.error);
      }
    } else if (answer === "RED") {
      const reasons = applicant?.review?.reviewResult?.rejectLabels?.join(", ");
      if (existing?.notify_email) {
        const result = await notifyCredentialRejected({
          email: existing.notify_email,
          credentialType: existing.credential_type || "KYCVerified",
          reason: reasons,
        });
        if (result.ok && existing.id) markKYCNotified(existing.id);
        else if (!result.ok) console.warn("[notify] rejection email failed:", result.error);
      }
    }
  }

  return { ok: true };
});

app.get("/api/notify/status", async () => ({ enabled: emailConfig.enabled, from: emailConfig.from }));

// ================================================================
// Start
// ================================================================

const port = CONFIG.port;
await app.listen({ port, host: "0.0.0.0" });
console.log(`[server] HSK Passport API listening on :${port}`);

startIndexer();
startAutoIssuer();
