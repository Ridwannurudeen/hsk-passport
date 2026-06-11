import { expect } from "chai";
import { ethers } from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import crypto from "node:crypto";

// P1: blind-issuance claim delegate against the REAL HSKPassport.
// The FDH/RSA helpers below mirror ClaimCredential.sol byte-for-byte.

function i2osp(n: bigint | number, len: number): Buffer {
  const b = Buffer.alloc(len);
  let x = BigInt(n);
  for (let i = len - 1; i >= 0; i--) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}
function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}
// FDH(commitment): MGF1-SHA256(seed, 256) with top byte zeroed → < N.
function messageRep(commitment: bigint): Buffer {
  const seed = sha256(i2osp(commitment, 32));
  const rep = Buffer.alloc(256);
  let off = 0;
  let counter = 0;
  while (off < 256) {
    const blk = sha256(Buffer.concat([seed, i2osp(counter, 4)]));
    for (let i = 0; i < 32 && off < 256; i++) rep[off++] = blk[i];
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
const b64uToBig = (s: string): bigint =>
  BigInt("0x" + Buffer.from(s, "base64url").toString("hex"));
function toBytesBE(x: bigint, len?: number): string {
  let h = x.toString(16);
  if (h.length % 2) h = "0" + h;
  if (len) h = h.padStart(len * 2, "0");
  return "0x" + h;
}

describe("ClaimCredential — blind issuance P1 (real HSKPassport delegate)", () => {
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
  const NLEN = 256;

  let passport: any;
  let claim: any;
  let owner: any;
  let user: any;

  async function deployStack() {
    [owner, user] = await ethers.getSigners();
    const verifier = await (
      await ethers.getContractFactory("SemaphoreVerifier")
    ).deploy();
    const poseidon = await (
      await ethers.getContractFactory("PoseidonT3")
    ).deploy();
    const semaphore = await (
      await ethers.getContractFactory("Semaphore", {
        libraries: {
          "poseidon-solidity/PoseidonT3.sol:PoseidonT3":
            await poseidon.getAddress(),
        },
      })
    ).deploy(await verifier.getAddress());
    passport = await (
      await ethers.getContractFactory("HSKPassport")
    ).deploy(await semaphore.getAddress());
    await passport.createCredentialGroup("KYC_VERIFIED", ethers.ZeroHash);
    claim = await (
      await ethers.getContractFactory("ClaimCredential")
    ).deploy(await passport.getAddress(), 0, toBytesBE(N, NLEN), toBytesBE(e));
    await passport.approveDelegate(0, await claim.getAddress());
  }

  // Issuer blind-signs without ever seeing the commitment.
  function blindSign(commitment: bigint): string {
    const m = BigInt("0x" + messageRep(commitment).toString("hex"));
    const r =
      (BigInt("0x" + crypto.randomBytes(32).toString("hex")) % (N - 2n)) + 2n;
    const blinded = (m * modpow(r, e, N)) % N; // backend sees only this
    const blindSig = modpow(blinded, d, N);
    const sig = (blindSig * modinv(r, N)) % N; // user unblinds → sig^e == m
    expect(modpow(sig, e, N)).to.equal(m);
    return toBytesBE(sig, NLEN);
  }

  it("delegate claim adds the blind-signed commitment to the group", async () => {
    await deployStack();
    const commitment = new Identity().commitment;
    const sig = blindSign(commitment);
    expect(await claim.verify(commitment, sig)).to.equal(true);
    await (await claim.connect(user).claim(commitment, sig)).wait();
    expect(await passport.hasCredential(0, commitment)).to.equal(true);
  });

  it("rejects a tampered signature", async () => {
    await deployStack();
    const commitment = new Identity().commitment;
    const sig = blindSign(commitment);
    const bad =
      "0x" + (sig.slice(2, -2) + (sig.slice(-2) === "00" ? "01" : "00"));
    expect(await claim.verify(commitment, bad)).to.equal(false);
    await expect(claim.claim(commitment, bad)).to.be.revertedWithCustomError(
      claim,
      "BadSignature",
    );
  });

  it("nullifier prevents double-claim", async () => {
    await deployStack();
    const commitment = new Identity().commitment;
    const sig = blindSign(commitment);
    await (await claim.claim(commitment, sig)).wait();
    await expect(claim.claim(commitment, sig)).to.be.revertedWithCustomError(
      claim,
      "NullifierUsed",
    );
  });

  it("an un-approved claim contract cannot issue (delegate gating holds)", async () => {
    await deployStack();
    const rogue = await (
      await ethers.getContractFactory("ClaimCredential")
    ).deploy(await passport.getAddress(), 0, toBytesBE(N, NLEN), toBytesBE(e));
    const commitment = new Identity().commitment;
    const sig = blindSign(commitment);
    await expect(rogue.claim(commitment, sig)).to.be.reverted; // NotGroupIssuerOrDelegate
  });

  it("GAS: full claim()", async () => {
    await deployStack();
    const commitment = new Identity().commitment;
    const sig = blindSign(commitment);
    const rcpt = await (await claim.claim(commitment, sig)).wait();
    console.log(`        full claim() gas: ${rcpt!.gasUsed.toString()}`);
  });
});
