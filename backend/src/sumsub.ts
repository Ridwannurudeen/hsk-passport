import crypto from "crypto";

// Default to Sumsub sandbox so demo + local dev work out of the box.
// Production deployments must set SUMSUB_BASE_URL=https://api.sumsub.com explicitly.
const SUMSUB_BASE_URL = process.env.SUMSUB_BASE_URL || "https://api-stg.sumsub.com";
const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN || "";
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY || "";
const SUMSUB_WEBHOOK_SECRET = process.env.SUMSUB_WEBHOOK_SECRET || "";
const SUMSUB_LEVEL_NAME = process.env.SUMSUB_LEVEL_NAME || "hsk-passport-basic-kyc";

export const sumsubConfig = {
  configured: Boolean(SUMSUB_APP_TOKEN && SUMSUB_SECRET_KEY),
  levelName: SUMSUB_LEVEL_NAME,
  baseUrl: SUMSUB_BASE_URL,
};

/**
 * Sign a Sumsub API request using HMAC-SHA256.
 * Signature = HMAC(secret, timestamp + method + uri + body)
 */
function signRequest(method: string, uri: string, body: string, timestamp: number): string {
  const data = timestamp + method.toUpperCase() + uri + body;
  return crypto.createHmac("sha256", SUMSUB_SECRET_KEY).update(data).digest("hex");
}

interface SumsubCallOptions {
  method: "GET" | "POST" | "DELETE" | "PATCH";
  uri: string;                 // path + query string, e.g. /resources/applicants?foo=bar
  body?: Record<string, unknown>;
}

async function callSumsub<T = unknown>({ method, uri, body }: SumsubCallOptions): Promise<T> {
  if (!sumsubConfig.configured) {
    throw new Error("Sumsub not configured on server");
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyString = body ? JSON.stringify(body) : "";
  const signature = signRequest(method, uri, bodyString, timestamp);

  const res = await fetch(`${SUMSUB_BASE_URL}${uri}`, {
    method,
    headers: {
      "X-App-Token": SUMSUB_APP_TOKEN,
      "X-App-Access-Sig": signature,
      "X-App-Access-Ts": String(timestamp),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: bodyString || undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(
      `Sumsub API ${method} ${uri} failed: ${res.status} ${JSON.stringify(data).slice(0, 300)}`
    );
  }

  return data as T;
}

// ============================================================
// Public API
// ============================================================

export interface SumsubApplicant {
  id: string;
  externalUserId: string;
  createdAt: string;
  review?: {
    reviewStatus: string;
    reviewResult?: {
      reviewAnswer: "GREEN" | "RED" | "YELLOW";
      rejectLabels?: string[];
    };
  };
}

/** Create or fetch an applicant for a given externalUserId (use Semaphore commitment as externalUserId). */
export async function createApplicant(externalUserId: string): Promise<SumsubApplicant> {
  return callSumsub<SumsubApplicant>({
    method: "POST",
    uri: `/resources/applicants?levelName=${encodeURIComponent(SUMSUB_LEVEL_NAME)}`,
    body: { externalUserId },
  });
}

/** Fetch an existing applicant by externalUserId. Returns null if not found. */
export async function getApplicantByExternalId(externalUserId: string): Promise<SumsubApplicant | null> {
  try {
    return await callSumsub<SumsubApplicant>({
      method: "GET",
      uri: `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`,
    });
  } catch (e) {
    if ((e as Error).message.includes("404")) return null;
    throw e;
  }
}

export async function getApplicantById(applicantId: string): Promise<SumsubApplicant | null> {
  try {
    return await callSumsub<SumsubApplicant>({
      method: "GET",
      uri: `/resources/applicants/${applicantId}/one`,
    });
  } catch (e) {
    if ((e as Error).message.includes("404")) return null;
    throw e;
  }
}

/**
 * Get a short-lived access token for the Sumsub Web SDK.
 * The frontend uses this to initialize the embedded verification widget.
 */
export async function generateAccessToken(externalUserId: string, ttlSec = 600): Promise<{ token: string; userId: string }> {
  return callSumsub<{ token: string; userId: string }>({
    method: "POST",
    uri: `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&levelName=${encodeURIComponent(SUMSUB_LEVEL_NAME)}&ttlInSecs=${ttlSec}`,
  });
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
  address?: { formattedAddress?: string };
}

/**
 * Fetch extracted ID document info for an applicant.
 * Returns the verified fields that Sumsub pulled from the submitted documents.
 */
export async function getApplicantInfo(applicantId: string): Promise<{ idDocs: SumsubIdDoc[] } | null> {
  try {
    return await callSumsub<{ idDocs: SumsubIdDoc[] }>({
      method: "GET",
      uri: `/resources/applicants/${applicantId}/one`,
    }).then((full: unknown) => {
      const f = full as { info?: { idDocs?: SumsubIdDoc[] }; fixedInfo?: { idDocs?: SumsubIdDoc[] } };
      const idDocs = f.info?.idDocs || f.fixedInfo?.idDocs || [];
      return { idDocs };
    });
  } catch (e) {
    if ((e as Error).message.includes("404")) return null;
    throw e;
  }
}

// ============================================================
// Webhook signature verification
// ============================================================

/**
 * Verify the HMAC signature of an incoming webhook payload.
 * Sumsub sends signature in header `x-payload-digest` (some accounts use `X-Payload-Digest-Alg` for algo).
 * Default algorithm is HMAC-SHA256 of the raw request body using the webhook secret.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, providedSignature: string, algo: string = "HMAC_SHA256_HEX"): boolean {
  if (!SUMSUB_WEBHOOK_SECRET) return false;
  if (!providedSignature) return false;

  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");

  let hashAlgo: "sha1" | "sha256" | "sha512";
  switch (algo.toUpperCase()) {
    case "HMAC_SHA1_HEX":
      hashAlgo = "sha1"; break;
    case "HMAC_SHA512_HEX":
      hashAlgo = "sha512"; break;
    case "HMAC_SHA256_HEX":
    default:
      hashAlgo = "sha256"; break;
  }
  const hash = crypto.createHmac(hashAlgo, SUMSUB_WEBHOOK_SECRET).update(bodyBuf).digest();

  let providedBuf: Buffer;
  try {
    providedBuf = Buffer.from(providedSignature.toLowerCase(), "hex");
  } catch {
    return false;
  }
  if (providedBuf.length !== hash.length) return false; // length-check is constant-time
  return crypto.timingSafeEqual(hash, providedBuf);
}
