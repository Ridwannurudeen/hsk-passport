import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "crypto";
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

const app = Fastify({ logger: { level: "info" } });

await app.register(cors, { origin: true });

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
  };

  if (!body.commitment || !body.wallet || !body.jurisdiction || !body.credentialType) {
    reply.code(400);
    return { error: "missing required fields: commitment, wallet, jurisdiction, credentialType" };
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
  });

  return { id, status: "pending" };
});

app.get("/api/kyc/queue", async (request) => {
  const { status } = request.query as { status?: string };
  const queue = getKYCQueue(status);
  return { queue, count: queue.length };
});

app.get("/api/kyc/status/:commitment", async (request) => {
  const { commitment } = request.params as { commitment: string };
  const req = getKYCByCommitment(commitment);
  return req || { status: "none" };
});

app.get("/api/kyc/request/:id", async (request) => {
  const { id } = request.params as { id: string };
  const req = getKYCRequest(id);
  return req || { error: "not found" };
});

app.post("/api/kyc/review", async (request, reply) => {
  const body = request.body as {
    id?: string;
    reviewer?: string;
    action?: "approve" | "reject";
    txHash?: string;
    rejectionReason?: string;
  };

  if (!body.id || !body.reviewer || !body.action) {
    reply.code(400);
    return { error: "missing required fields: id, reviewer, action" };
  }

  const req = getKYCRequest(body.id) as any;
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
// Start
// ================================================================

const port = CONFIG.port;
await app.listen({ port, host: "0.0.0.0" });
console.log(`[server] HSK Passport API listening on :${port}`);

startIndexer();
