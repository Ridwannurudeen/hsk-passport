// Client-side RSA blind signing for blind-issuance (CRITICAL #2).
//
// The commitment never leaves the browser unblinded: we compute the full-domain
// hash of the commitment, blind it with a random factor, send only the blinded
// value to /api/kyc/voucher, then unblind the returned signature locally. The
// result is a signature ClaimCredential.sol verifies as sig^e mod N == FDH(c).
//
// messageRep / blind / unblind mirror contracts/contracts/ClaimCredential.sol
// and contracts/test/ClaimCredential.test.ts byte-for-byte (MGF1-SHA256 to the
// modulus width, top byte zeroed). SHA-256 uses WebCrypto, which is identical to
// the Node SHA-256 the contract test verifies against.

const NLEN = 256; // 2048-bit modulus, big-endian

/** Integer-to-octet-string: big-endian `len`-byte encoding of n. */
function i2osp(n: bigint, len: number): Uint8Array {
  const b = new Uint8Array(len);
  let x = n;
  for (let i = len - 1; i >= 0; i--) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}

function bytesToBigInt(b: Uint8Array): bigint {
  let x = 0n;
  for (const byte of b) x = (x << 8n) | BigInt(byte);
  return x;
}

/** Big-endian hex of x. With `len`, zero-pad to len bytes (fixed-width sig/blinded). */
export function toBytesBE(x: bigint, len?: number): string {
  let h = x.toString(16);
  if (h.length % 2) h = "0" + h;
  if (len) h = h.padStart(len * 2, "0");
  return "0x" + h;
}

async function sha256(buf: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", buf as BufferSource);
  return new Uint8Array(digest);
}

/**
 * FDH(commitment) into [0, N): MGF1-SHA256 of sha256(commitment) expanded to
 * NLEN bytes, with the top byte zeroed so the representative is < N (a 2048-bit
 * modulus always has its high bit set). Matches ClaimCredential.messageRep.
 */
export async function messageRep(commitment: bigint): Promise<Uint8Array> {
  const seed = await sha256(i2osp(commitment, 32));
  const rep = new Uint8Array(NLEN);
  let off = 0;
  let counter = 0;
  while (off < NLEN) {
    const block = new Uint8Array(seed.length + 4);
    block.set(seed, 0);
    block.set(i2osp(BigInt(counter), 4), seed.length);
    const blk = await sha256(block);
    for (let i = 0; i < 32 && off < NLEN; i++) rep[off++] = blk[i];
    counter++;
  }
  rep[0] = 0;
  return rep;
}

function modpow(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n;
  b %= m;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    e >>= 1n;
    b = (b * b) % m;
  }
  return r;
}

function egcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x, y] = egcd(b, a % b);
  return [g, y, x - (a / b) * y];
}

function modinv(a: bigint, m: bigint): bigint {
  const [, x] = egcd(((a % m) + m) % m, m);
  return ((x % m) + m) % m;
}

/** Cryptographically-random blinding factor in [2, N). */
function randomBlindingFactor(N: bigint): bigint {
  const bytes = new Uint8Array(NLEN);
  crypto.getRandomValues(bytes);
  return (bytesToBigInt(bytes) % (N - 2n)) + 2n;
}

export interface BlindedCommitment {
  /** m·r^e mod N — the only value the backend ever sees. */
  blinded: string;
  /** Blinding factor, kept locally to unblind the returned signature. */
  r: bigint;
}

/** Blind a commitment against the issuer public key (N, e). */
export async function blindCommitment(
  commitment: bigint,
  N: bigint,
  e: bigint,
): Promise<BlindedCommitment> {
  const m = bytesToBigInt(await messageRep(commitment));
  const r = randomBlindingFactor(N);
  const blinded = (m * modpow(r, e, N)) % N;
  return { blinded: toBytesBE(blinded, NLEN), r };
}

/**
 * Unblind the issuer's blind signature into sig = blindSig·r^-1 mod N, returned
 * as a fixed-width hex string suitable for ClaimCredential.claim(commitment, sig).
 */
export function unblind(blindSigHex: string, r: bigint, N: bigint): string {
  const blindSig = BigInt(
    blindSigHex.startsWith("0x") ? blindSigHex : "0x" + blindSigHex,
  );
  const sig = (blindSig * modinv(r, N)) % N;
  return toBytesBE(sig, NLEN);
}
