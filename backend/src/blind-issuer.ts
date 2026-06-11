import crypto from "crypto";

// Blind-issuance voucher signer (CRITICAL #2, docs/blind-issuance-design.md).
//
// The voucher endpoint performs ONE operation: a raw RSA private exponentiation
// over a *blinded* value the client sends — blindSig = blinded^d mod N. The
// client blinds its Semaphore commitment before sending and unblinds the result
// locally, so this process never sees the commitment. The matching public key
// (N, e) is what ClaimCredential.sol is deployed with; the contract verifies
// sig^e mod N == FDH(commitment) and then adds the commitment to the group.
//
// Key handling mirrors contracts/test/ClaimCredential.test.ts: a JWK export
// gives (n, e, d) as base64url, which we read as big-endian integers. The on-
// chain modulus is 2048-bit, so NLEN is fixed at 256 bytes.

const NLEN = 256; // 2048-bit modulus, big-endian

export interface VoucherKey {
  N: bigint;
  e: bigint;
  d: bigint;
}

const b64uToBig = (s: string): bigint =>
  BigInt("0x" + Buffer.from(s, "base64url").toString("hex"));

/** Big-endian hex of x. With `len`, zero-pad to len bytes (used for fixed-width N/sig). */
function toBytesBE(x: bigint, len?: number): string {
  let h = x.toString(16);
  if (h.length % 2) h = "0" + h;
  if (len) h = h.padStart(len * 2, "0");
  return "0x" + h;
}

function modpow(b: bigint, exp: bigint, m: bigint): bigint {
  let r = 1n;
  b %= m;
  while (exp > 0n) {
    if (exp & 1n) r = (r * b) % m;
    exp >>= 1n;
    b = (b * b) % m;
  }
  return r;
}

/** Parse a PKCS#8/PKCS#1 RSA private key (PEM) into raw (N, e, d) integers. */
export function loadVoucherKeyFromPem(pem: string): VoucherKey {
  const jwk = crypto.createPrivateKey(pem).export({ format: "jwk" }) as {
    kty?: string;
    n?: string;
    e?: string;
    d?: string;
  };
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e || !jwk.d) {
    throw new Error("VOUCHER_RSA_PRIVATE_KEY is not an RSA private key");
  }
  const key = { N: b64uToBig(jwk.n), e: b64uToBig(jwk.e), d: b64uToBig(jwk.d) };
  const bits = key.N.toString(2).length;
  if (bits < 2041 || bits > 2048) {
    throw new Error(
      `VOUCHER_RSA_PRIVATE_KEY must be 2048-bit to match ClaimCredential (got ${bits}-bit)`,
    );
  }
  return key;
}

/** Public key the client needs to blind and ClaimCredential is deployed with. */
export function publicKeyHex(key: VoucherKey): { n: string; e: string } {
  return { n: toBytesBE(key.N, NLEN), e: toBytesBE(key.e) };
}

/**
 * Blind-sign: blindSig = blinded^d mod N. `blindedHex` is the client's blinded
 * commitment (m·r^e mod N) as a hex string. The result is the blinded signature
 * the client unblinds to sig = blindSig·r^-1 mod N. We never learn m, r, or the
 * commitment.
 */
export function blindSign(blindedHex: string, key: VoucherKey): string {
  const h = blindedHex.startsWith("0x") ? blindedHex : "0x" + blindedHex;
  if (!/^0x[0-9a-fA-F]+$/.test(h)) throw new Error("blinded must be hex");
  const blinded = BigInt(h);
  // A blinded value outside (1, N) can leak structure or is malformed; reject it.
  if (blinded <= 1n || blinded >= key.N) {
    throw new Error("blinded value out of range");
  }
  return toBytesBE(modpow(blinded, key.d, key.N), NLEN);
}

// ── env wrapper ───────────────────────────────────────────────────────────

const VOUCHER_RSA_PRIVATE_KEY = process.env.VOUCHER_RSA_PRIVATE_KEY || "";

export const voucherConfig = {
  configured: Boolean(VOUCHER_RSA_PRIVATE_KEY),
};

let cachedKey: VoucherKey | null = null;

/** Lazily parse and cache the issuer key. Throws if unconfigured. */
export function getVoucherKey(): VoucherKey {
  if (!VOUCHER_RSA_PRIVATE_KEY) {
    throw new Error("voucher signing key not configured");
  }
  if (!cachedKey) cachedKey = loadVoucherKeyFromPem(VOUCHER_RSA_PRIVATE_KEY);
  return cachedKey;
}
