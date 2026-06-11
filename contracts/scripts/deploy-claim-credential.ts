/**
 * Deploy ClaimCredential (blind-issuance claim delegate, CRITICAL #2) and, if the
 * deployer is the group's issuer, approve it as a delegate of that group.
 *
 * The contract is pinned to the issuer's RSA public key (N, e) — the SAME key the
 * backend voucher endpoint signs with (VOUCHER_RSA_PRIVATE_KEY). Provide the key
 * via either:
 *   VOUCHER_RSA_PUBLIC_KEY   — SPKI PEM (preferred; the private key need not be
 *                              present in the deploy environment), or
 *   VOUCHER_RSA_PRIVATE_KEY  — PKCS#8 PEM (the public part is derived from it).
 *
 * Optional env: CLAIM_GROUP_ID (default 25 = KYC_VERIFIED).
 *
 * approveDelegate is onlyGroupIssuer — only the group's original issuer may grant
 * the delegate. If the deployer is not that issuer, the script deploys and then
 * prints the exact call the issuer must make.
 *
 * Additive-only: deploys one new contract and (at most) sets one delegate flag on
 * the live HSKPassport. Nothing existing is modified.
 *
 * Run: npx hardhat run scripts/deploy-claim-credential.ts --network hashkey-testnet
 */

import { ethers, network } from "hardhat";
import crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const NLEN = 256; // 2048-bit modulus, big-endian — must match ClaimCredential.NLEN

const b64uToBig = (s: string): bigint =>
  BigInt("0x" + Buffer.from(s, "base64url").toString("hex"));

function toBytesBE(x: bigint, len?: number): string {
  let h = x.toString(16);
  if (h.length % 2) h = "0" + h;
  if (len) h = h.padStart(len * 2, "0");
  return "0x" + h;
}

/** Derive (N, e) from whichever issuer RSA key the environment provides. */
function loadPublicKey(): { N: bigint; e: bigint } {
  const pubPem = process.env.VOUCHER_RSA_PUBLIC_KEY;
  const privPem = process.env.VOUCHER_RSA_PRIVATE_KEY;
  const keyObj = pubPem
    ? crypto.createPublicKey(pubPem)
    : privPem
      ? crypto.createPublicKey(crypto.createPrivateKey(privPem))
      : null;
  if (!keyObj) {
    throw new Error(
      "Set VOUCHER_RSA_PUBLIC_KEY (SPKI PEM) or VOUCHER_RSA_PRIVATE_KEY (PKCS#8 PEM) " +
        "to the issuer key the backend voucher endpoint signs with.",
    );
  }
  const jwk = keyObj.export({ format: "jwk" }) as {
    kty?: string;
    n?: string;
    e?: string;
  };
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
    throw new Error("Provided key is not an RSA public key");
  }
  const N = b64uToBig(jwk.n);
  const bits = N.toString(2).length;
  if (bits < 2041 || bits > 2048) {
    throw new Error(`Issuer key must be 2048-bit (got ${bits}-bit)`);
  }
  return { N, e: b64uToBig(jwk.e) };
}

async function main() {
  const groupId = Number(process.env.CLAIM_GROUP_ID ?? 25);
  if (!Number.isInteger(groupId) || groupId < 0) {
    throw new Error(`invalid CLAIM_GROUP_ID: ${process.env.CLAIM_GROUP_ID}`);
  }

  const { N, e } = loadPublicKey();
  const modulus = toBytesBE(N, NLEN);
  const exponent = toBytesBE(e);

  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network:  ${network.name} (chainId=${net.chainId})`);
  console.log(
    `Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`,
  );
  console.log(`Group:    ${groupId}`);
  console.log(
    `Issuer N: ${modulus.slice(0, 18)}… (${(modulus.length - 2) / 2} bytes), e=${exponent}\n`,
  );

  const sdkAddresses = await import("../../sdk/src/addresses").catch(() =>
    require("../../sdk/src/addresses"),
  );
  const deployment = sdkAddresses.DEPLOYMENTS?.[network.name];
  const passportAddress: string | undefined =
    process.env.HSK_PASSPORT_ADDRESS || deployment?.contracts?.hskPassport;
  if (!passportAddress) {
    throw new Error(
      `HSKPassport address not found for network "${network.name}". ` +
        `Set HSK_PASSPORT_ADDRESS to deploy against it.`,
    );
  }
  console.log(`HSKPassport: ${passportAddress}`);

  console.log("\n--- Deploying ClaimCredential ---");
  const Claim = await ethers.getContractFactory("ClaimCredential");
  const claim = await Claim.deploy(passportAddress, groupId, modulus, exponent);
  await claim.waitForDeployment();
  const claimAddr = await claim.getAddress();
  console.log(`  ClaimCredential: ${claimAddr}`);

  // approveDelegate is onlyGroupIssuer — read the group's issuer and only approve
  // if the deployer is it; otherwise hand off the exact call.
  const passport = await ethers.getContractAt("HSKPassport", passportAddress);
  const group = await passport.credentialGroups(groupId);
  const groupIssuer: string = group.issuer;
  console.log(`\n  Group ${groupId} issuer: ${groupIssuer}`);

  let approved = false;
  if (groupIssuer.toLowerCase() === deployer.address.toLowerCase()) {
    console.log("  Deployer is the group issuer — approving delegate...");
    const tx = await passport.approveDelegate(groupId, claimAddr);
    await tx.wait();
    approved = true;
    console.log(`  Delegate approved in ${tx.hash}`);
  } else {
    console.log(
      "  Deployer is NOT the group issuer — skipping approval.\n" +
        `  The group issuer (${groupIssuer}) must run:\n` +
        `    passport.approveDelegate(${groupId}, "${claimAddr}")`,
    );
  }

  const record = {
    network: network.name,
    chainId: Number(net.chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: { claimCredential: claimAddr },
    groupId,
    groupIssuer,
    delegateApproved: approved,
    issuer: { modulus, exponent },
  };
  const outDir = path.resolve(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `claim-credential-${net.chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log(`\nDeployment record: ${outFile}`);

  console.log("\nNext steps:");
  console.log(
    `  1. Set frontend/src/lib/contracts.ts CLAIM_CREDENTIAL.address = "${claimAddr}"`,
  );
  console.log(
    "  2. Ensure the backend's VOUCHER_RSA_PRIVATE_KEY matches the (N, e) above.",
  );
  if (!approved)
    console.log("  3. Have the group issuer approve the delegate (see above).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
