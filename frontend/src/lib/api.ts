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
  freshnessCommitment?: string;
}): Promise<{ id: string; status: string; message?: string }> {
  const res = await fetch(`${apiBase()}/api/kyc/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`KYC submit failed: ${res.status}`);
  return res.json();
}

/** v6 - attach a freshness commitment to a Sumsub-flow KYC request after the
 *  user has generated their freshness identity. The Sumsub init path creates
 *  the placeholder row before the user picks freshness, so this fills it in. */
export async function apiAttachFreshnessCommitment(
  commitment: string,
  freshnessCommitment: string,
): Promise<{ id?: string; ok?: boolean; error?: string }> {
  const res = await fetch(`${apiBase()}/api/kyc/freshness/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commitment, freshnessCommitment }),
  });
  // 404 is "no pending request yet" - caller decides whether to retry.
  if (!res.ok && res.status !== 404) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function apiGetKYCStatus(commitment: string): Promise<KYCRequest | { status: "none" }> {
  const res = await fetch(`${apiBase()}/api/kyc/status/${commitment}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export interface IssuerAuth {
  address: string;
  signature: string;
  nonce: number;
}

/** Build the message a reviewer must sign to read the queue / individual KYC requests. */
export function buildIssuerReadMessage(nonce: number): string {
  return `HSK Passport issuer read at ${nonce}`;
}

export async function apiGetKYCQueue(
  status: "pending" | "approved" | "rejected" | "" = "pending",
  auth?: IssuerAuth,
): Promise<{
  queue: KYCRequest[];
  count: number;
  authenticated?: boolean;
  note?: string;
}> {
  const q = status ? `?status=${status}` : "";
  const headers: Record<string, string> = {};
  if (auth) {
    headers["x-issuer-addr"] = auth.address;
    headers["x-issuer-sig"] = auth.signature;
    headers["x-issuer-nonce"] = String(auth.nonce);
  }
  const res = await fetch(`${apiBase()}/api/kyc/queue${q}`, { cache: "no-store", headers });
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

export async function apiSumsubInit(
  commitment: string,
  notifyEmail?: string,
  country?: string,
  signal?: AbortSignal,
  freshnessCommitment?: string,
): Promise<{
  applicantId: string;
  accessToken: string;
  levelName: string;
  reviewStatus: string;
  reviewAnswer: string | null;
}> {
  const body = JSON.stringify({
    commitment,
    notifyEmail: notifyEmail || undefined,
    country: country || undefined,
    freshnessCommitment: freshnessCommitment || undefined,
  });
  // Retry once on network-level failure (TypeError from fetch). Sumsub's create-applicant
  // is idempotent on externalUserId (= commitment), so a retry is safe. Skip retry on
  // AbortError (we intentionally cancelled) or HTTP errors (real backend issue).
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${apiBase()}/api/kyc/sumsub/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error || `Sumsub init failed: ${res.status}`);
      }
      return res.json();
    } catch (e) {
      lastErr = e;
      const err = e as Error;
      if (err.name === "AbortError" || signal?.aborted) throw e;
      if (!(err instanceof TypeError) || attempt === 1) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr;
}

export interface SumsubIdDoc {
  idDocType?: string;
  country?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  dob?: string;
  issuedDate?: string;
  validUntil?: string;
  number?: string;
}

export async function apiSumsubData(commitment: string): Promise<{
  applicantId?: string;
  reviewStatus?: string;
  reviewAnswer?: string | null;
  idDocs?: SumsubIdDoc[];
  status?: string;
}> {
  const res = await fetch(`${apiBase()}/api/kyc/sumsub/data/${commitment}`, { cache: "no-store" });
  if (!res.ok) return {};
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

// ── IssuerRegistry directory ──────────────────────────────

export interface IssuerMetadata {
  name: string;
  website?: string;
  contact: { email: string; abuseEmail?: string; securityEmail?: string };
  kycMethod: string;
  kycMethodNotes?: string;
  jurisdictions: string[];
  regulatoryLicenses?: Array<{
    regulator: string;
    licenseNumber: string;
    licenseType?: string;
    validUntil?: string;
    publicRegistryURL?: string;
  }>;
  supportedCredentials?: string[];
  operationalSecurity?: {
    keyCustody?: string;
    incidentResponseURL?: string;
    soc2Type2?: boolean;
    iso27001?: boolean;
  };
  publishedAt: string;
  logoURL?: string;
}

export interface IssuerView {
  address: string;
  active: boolean;
  tier: number;
  tierName: string;
  stakeWei: string;
  stakeHSK: string;
  stakedAt: number;
  totalIssued: number;
  totalRevoked: number;
  slashedAmountWei: string;
  reputation: number;
  metadataURI: string;
  metadata: IssuerMetadata | null;
  metadataError: string | null;
}

export interface IssuerRegistryStats {
  communityMinStakeWei: string;
  kycProviderMinStakeWei: string;
  institutionalMinStakeWei: string;
  unstakeCooldownSec: number;
  totalIssuers: number;
  activeIssuers: number;
}

export async function apiGetIssuers(): Promise<{ stats: IssuerRegistryStats; issuers: IssuerView[] }> {
  const res = await fetch(`${apiBase()}/api/issuers`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// Health / status

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
    testnet: { ok: boolean; headBlock: number; latencyMs: number; error: string | null };
    mainnet: { ok: boolean; headBlock: number; latencyMs: number; error: string | null };
  };
  db: { ok: boolean; activeCredentials: number; kycPending: number };
}

export async function apiGetHealth(): Promise<HealthReport> {
  const res = await fetch(`${apiBase()}/api/healthz`, { cache: "no-store" });
  // /api/healthz always returns parseable JSON, even when degraded - only
  // throw on transport failure or 5xx where the body is not a HealthReport.
  if (!res.ok && res.status !== 503) throw new Error(`API ${res.status}`);
  return res.json();
}

// v6 freshness

export interface FreshnessTreeState {
  groupId: number;
  depth: number;
  leafCount: number;
  root: string;
  leaves: string[];
}

export interface FreshnessIdentityState {
  status: "ok" | "not_found";
  groupId?: number;
  leafIndex?: number;
  leaf?: string;
  issuanceTime?: number;
  rootAfterInsert?: string;
  postedTx?: string;
  postedAt?: number;
}

export async function apiGetFreshnessState(groupId: number): Promise<FreshnessTreeState> {
  const res = await fetch(`${apiBase()}/api/freshness/state/${groupId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function apiGetFreshnessIdentity(
  freshnessCommitment: string,
): Promise<FreshnessIdentityState> {
  const res = await fetch(
    `${apiBase()}/api/freshness/identity/${freshnessCommitment}`,
    { cache: "no-store" },
  );
  if (res.status === 404) return { status: "not_found" };
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export interface RegistryGovernanceState {
  registryAddress: string;
  owner: string;
  slashingAuthority: string;
  ownerIsTimelock: boolean;
  slashingIsTimelock: boolean;
  timelockMinDelaySec: number | null;
}

export async function apiGetRegistryGovernance(): Promise<RegistryGovernanceState | null> {
  try {
    const res = await fetch(`${apiBase()}/api/registry/governance`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
