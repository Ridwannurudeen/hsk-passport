// Generate the blind-issuance voucher RSA keypair (CRITICAL #2).
//
// The SAME key is used in two places, and they MUST match:
//   - backend  VOUCHER_RSA_PRIVATE_KEY  signs blinded commitments
//   - contract ClaimCredential(modulus, exponent) verifies the unblinded sig
//
// This prints the private key (PKCS#8 PEM), the public key (SPKI PEM), and the
// exact (N, e) bytes the contract is deployed with — derived identically to
// backend/src/blind-issuer.ts publicKeyHex(), so what you see here is what the
// deploy script (contracts/scripts/deploy-claim-credential.ts) will pin.
//
// Run (in a secure environment — the private key is a signing secret):
//   node scripts/gen-voucher-key.mjs
//
// Then set VOUCHER_RSA_PRIVATE_KEY on the backend host and provide the same key
// (or its public half via VOUCHER_RSA_PUBLIC_KEY) to the deploy script. Never
// commit the private key.

import crypto from "node:crypto";

const NLEN = 256; // 2048-bit modulus, big-endian — matches ClaimCredential.NLEN

const b64uToBig = (s) => BigInt("0x" + Buffer.from(s, "base64url").toString("hex"));

function toBytesBE(x, len) {
  let h = x.toString(16);
  if (h.length % 2) h = "0" + h;
  if (len) h = h.padStart(len * 2, "0");
  return "0x" + h;
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicPem = publicKey.export({ type: "spki", format: "pem" });

const jwk = publicKey.export({ format: "jwk" });
const N = b64uToBig(jwk.n);
const e = b64uToBig(jwk.e);
const modulus = toBytesBE(N, NLEN);
const exponent = toBytesBE(e);

const bits = N.toString(2).length;
if (bits < 2041 || bits > 2048) {
  console.error(`Generated a ${bits}-bit modulus; expected 2048. Re-run.`);
  process.exit(1);
}

console.log("=".repeat(72));
console.log("VOUCHER_RSA_PRIVATE_KEY  (backend secret — keep safe, never commit)");
console.log("=".repeat(72));
process.stdout.write(privatePem);
console.log("=".repeat(72));
console.log("VOUCHER_RSA_PUBLIC_KEY  (safe to share; for the deploy environment)");
console.log("=".repeat(72));
process.stdout.write(publicPem);
console.log("=".repeat(72));
console.log("On-chain key the deploy script pins into ClaimCredential:");
console.log(`  modulus  (N, ${NLEN} bytes): ${modulus}`);
console.log(`  exponent (e):                ${exponent}`);
console.log("=".repeat(72));
console.log(
  "Next: set VOUCHER_RSA_PRIVATE_KEY on the backend host, then run\n" +
    "  contracts/scripts/deploy-claim-credential.ts\n" +
    "with VOUCHER_RSA_PRIVATE_KEY (or VOUCHER_RSA_PUBLIC_KEY) so the deployed\n" +
    "contract verifies against this exact key.",
);
