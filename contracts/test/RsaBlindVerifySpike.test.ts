import { expect } from "chai";
import { ethers } from "hardhat";
import crypto from "node:crypto";

// P0 spike (docs/blind-issuance-design.md): prove a Chaumian RSA blind signature
// over a credential commitment verifies on-chain via the modexp precompile, and
// measure the gas. SPIKE — textbook RSA (256-bit message rep, no FDH/PSS).

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

const b64uToBig = (s: string): bigint =>
  BigInt("0x" + Buffer.from(s, "base64url").toString("hex"));

function toBytesBE(x: bigint, len?: number): string {
  let h = x.toString(16);
  if (h.length % 2) h = "0" + h;
  if (len) h = h.padStart(len * 2, "0");
  return "0x" + h;
}

describe("RsaBlindVerifySpike — blind-issuance P0", () => {
  // 2048-bit RSA key; export raw n/e/d via JWK.
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = privateKey.export({ format: "jwk" }) as {
    n: string;
    e: string;
    d: string;
  };
  const N = b64uToBig(jwk.n);
  const e = b64uToBig(jwk.e);
  const d = b64uToBig(jwk.d);
  const NLEN = 256; // 2048-bit

  // A credential commitment (Semaphore-sized) and its on-chain message rep.
  const commitment =
    19134619134619134619134619134619134619134619134619134619134619134n;

  async function deploy() {
    const F = await ethers.getContractFactory("RsaBlindVerifySpike");
    const c = await F.deploy(toBytesBE(N, NLEN), toBytesBE(e));
    await c.waitForDeployment();
    return c;
  }

  // Backend blind-signs without seeing the commitment; user unblinds.
  function blindSign(): { sigBytes: string } {
    const mHex = ethers.solidityPackedKeccak256(["uint256"], [commitment]);
    const m = BigInt(mHex);

    // user-side blinding factor r, coprime to N
    const r =
      (BigInt("0x" + crypto.randomBytes(32).toString("hex")) % (N - 2n)) + 2n;
    const blinded = (m * modpow(r, e, N)) % N; // what the backend sees
    const blindSig = modpow(blinded, d, N); // backend signs blindly
    const sig = (blindSig * modinv(r, N)) % N; // user unblinds → m^d mod N

    // off-chain sanity: sig^e == m (mod N)
    expect(modpow(sig, e, N)).to.equal(m);
    return { sigBytes: toBytesBE(sig, NLEN) };
  }

  it("verifies a valid blind-signed commitment on-chain", async () => {
    const c = await deploy();
    const { sigBytes } = blindSign();
    expect(await c.verify(commitment, sigBytes)).to.equal(true);
  });

  it("rejects a tampered signature", async () => {
    const c = await deploy();
    const { sigBytes } = blindSign();
    const bad =
      "0x" +
      (sigBytes.slice(2, -2) + (sigBytes.slice(-2) === "00" ? "01" : "00"));
    expect(await c.verify(commitment, bad)).to.equal(false);
  });

  it("claim burns a one-time nullifier (no double-claim)", async () => {
    const c = await deploy();
    const { sigBytes } = blindSign();
    await (await c.claim(commitment, sigBytes)).wait();
    await expect(c.claim(commitment, sigBytes)).to.be.revertedWith(
      "nullifier used",
    );
  });

  it("GAS: reports modexp verify + full claim cost", async () => {
    const c = await deploy();
    const { sigBytes } = blindSign();
    const verifyGas = await c.verify.estimateGas(commitment, sigBytes);
    const rcpt = await (await c.claim(commitment, sigBytes)).wait();
    console.log(`        RSA-2048 verify (view) gas: ${verifyGas.toString()}`);
    console.log(
      `        full claim() gas:           ${rcpt!.gasUsed.toString()}`,
    );
    // Sanity ceiling — modexp + compare should be well under 1M gas.
    expect(verifyGas).to.be.lessThan(1_000_000n);
  });
});
