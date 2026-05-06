"use client";

// v6 freshness identity: a separate secret/commitment pair from the Semaphore
// identity. The freshness circuit derives identityCommitment = Poseidon(secret),
// which is incompatible with Semaphore v4's EdDSA-derived commitment — see the
// circuit comment in circuits/src/credential_freshness.circom for why.
//
// Persistence model mirrors lib/semaphore.ts: per-wallet map in localStorage,
// migrated lazily. The secret never leaves the browser.

import { poseidon1 } from "poseidon-lite";

const STORAGE_KEY = "hsk-passport-freshness-secrets";

type SecretMap = Record<string, string>; // walletAddress(lowercased) → decimal secret

function readMap(): SecretMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SecretMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: SecretMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function randomSecret(): bigint {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  // Clamp to BN254 scalar field — zeroing high bits is safe and deterministic
  // (same approach as lib/freshness.ts::randomSecret).
  arr[0] &= 0x1f;
  let r = 0n;
  for (const b of arr) r = (r << 8n) | BigInt(b);
  return r === 0n ? 1n : r;
}

/** Get-or-create the freshness secret for this wallet. Idempotent. */
export function ensureFreshnessIdentity(walletAddress: string): {
  secret: bigint;
  commitment: bigint;
} {
  const addr = walletAddress.toLowerCase();
  const map = readMap();
  let secretStr = map[addr];
  if (!secretStr) {
    const secret = randomSecret();
    secretStr = secret.toString();
    map[addr] = secretStr;
    writeMap(map);
  }
  const secret = BigInt(secretStr);
  const commitment = poseidon1([secret]);
  return { secret, commitment };
}

export function loadFreshnessIdentity(walletAddress: string): {
  secret: bigint;
  commitment: bigint;
} | null {
  const addr = walletAddress.toLowerCase();
  const map = readMap();
  const secretStr = map[addr];
  if (!secretStr) return null;
  const secret = BigInt(secretStr);
  return { secret, commitment: poseidon1([secret]) };
}

export function clearFreshnessIdentity(walletAddress: string): void {
  const addr = walletAddress.toLowerCase();
  const map = readMap();
  delete map[addr];
  writeMap(map);
}
