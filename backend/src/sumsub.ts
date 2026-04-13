import crypto from "crypto";

const SUMSUB_BASE_URL = process.env.SUMSUB_BASE_URL || "https://api.sumsub.com";
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

// ============================================================
// Webhook signature verification
// ============================================================

/**
 * Verify the HMAC signature of an incoming webhook payload.
 * Sumsub sends signature in header `x-payload-digest` (some accounts use `X-Payload-Digest-Alg` for algo).
 * Default algorithm is HMAC-SHA256 of the raw request body using the webhook secret.
 */
export function verifyWebhookSignature(rawBody: string, providedSignature: string, algo: string = "HMAC_SHA256_HEX"): boolean {
  if (!SUMSUB_WEBHOOK_SECRET) return false;
  if (!providedSignature) return false;

  let hash: string;
  switch (algo.toUpperCase()) {
    case "HMAC_SHA1_HEX":
      hash = crypto.createHmac("sha1", SUMSUB_WEBHOOK_SECRET).update(rawBody).digest("hex");
      break;
    case "HMAC_SHA512_HEX":
      hash = crypto.createHmac("sha512", SUMSUB_WEBHOOK_SECRET).update(rawBody).digest("hex");
      break;
    case "HMAC_SHA256_HEX":
    default:
      hash = crypto.createHmac("sha256", SUMSUB_WEBHOOK_SECRET).update(rawBody).digest("hex");
      break;
  }
  // Constant-time compare
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(providedSignature.toLowerCase(), "hex")
    );
  } catch {
    return false;
  }
}
