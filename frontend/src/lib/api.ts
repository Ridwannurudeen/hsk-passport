// Frontend API client for HSK Passport indexer backend.
// Falls back to direct RPC queries if the API is unavailable.

export interface KYCRequest {
  id: string;
  identity_commitment: string;
  wallet_address: string;
  jurisdiction: string;
  credential_type: string;
  document_type: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: number;
  reviewed_at: number | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  tx_hash: string | null;
}

export interface GlobalStats {
  activeCredentials: number;
  totalIssued: number;
  activeGroups: number;
  kycRequests: number;
  kycPending: number;
}

function apiBase(): string {
  if (typeof window === "undefined") return "";
  return ""; // same-origin /api/*
}

export async function apiGetGroupMembers(groupId: number): Promise<bigint[]> {
  const res = await fetch(`${apiBase()}/api/groups/${groupId}/members`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return (data.members as string[]).map((s) => BigInt(s));
}

export async function apiGetGlobalStats(): Promise<GlobalStats> {
  const res = await fetch(`${apiBase()}/api/stats/global`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function apiSubmitKYC(body: {
  commitment: string;
  wallet: string;
  jurisdiction: string;
  credentialType: string;
  documentType?: string;
}): Promise<{ id: string; status: string; message?: string }> {
  const res = await fetch(`${apiBase()}/api/kyc/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`KYC submit failed: ${res.status}`);
  return res.json();
}

export async function apiGetKYCStatus(commitment: string): Promise<KYCRequest | { status: "none" }> {
  const res = await fetch(`${apiBase()}/api/kyc/status/${commitment}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function apiGetKYCQueue(status: "pending" | "approved" | "rejected" | "" = "pending"): Promise<{
  queue: KYCRequest[];
  count: number;
}> {
  const q = status ? `?status=${status}` : "";
  const res = await fetch(`${apiBase()}/api/kyc/queue${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function apiReviewKYC(body: {
  id: string;
  reviewer: string;
  action: "approve" | "reject";
  signature: string;
  nonce: number;
  txHash?: string;
  rejectionReason?: string;
}): Promise<{ id: string; status: string }> {
  const res = await fetch(`${apiBase()}/api/kyc/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error || `KYC review failed: ${res.status}`);
  }
  return res.json();
}

/** Build the message a reviewer must sign */
export function buildReviewMessage(id: string, action: "approve" | "reject", nonce: number): string {
  return `HSK Passport review: ${action} request ${id} at ${nonce}`;
}

// ============================================================
// Sumsub integration
// ============================================================

export async function apiGetSumsubConfig(): Promise<{ enabled: boolean; levelName: string }> {
  const res = await fetch(`${apiBase()}/api/kyc/sumsub/config`, { cache: "no-store" });
  if (!res.ok) return { enabled: false, levelName: "" };
  return res.json();
}

export async function apiSumsubInit(commitment: string): Promise<{
  applicantId: string;
  accessToken: string;
  levelName: string;
  reviewStatus: string;
  reviewAnswer: string | null;
}> {
  const res = await fetch(`${apiBase()}/api/kyc/sumsub/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commitment }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error || `Sumsub init failed: ${res.status}`);
  }
  return res.json();
}

export async function apiSumsubStatus(commitment: string): Promise<{
  applicantId?: string;
  reviewStatus?: string;
  reviewAnswer?: string | null;
  rejectLabels?: string[];
  status?: string;
}> {
  const res = await fetch(`${apiBase()}/api/kyc/sumsub/status/${commitment}`, { cache: "no-store" });
  if (!res.ok) return {};
  return res.json();
}
