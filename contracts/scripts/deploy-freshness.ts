/**
 * Deploy FreshnessRegistry + FreshnessVerifier + HSKPassportFreshness.
 *
 * Prerequisite: run `node circuits/scripts/build.js` first to produce
 * contracts/contracts/freshness/FreshnessVerifier.sol. If that file is missing
 * this script aborts with a clear message.
 *
 * Additive-only: does not touch the deployed HSKPassport, Semaphore, or any
 * existing contract. The deployer becomes the registry owner; the existing
 * HSKPassport DemoIssuer (looked up from sdk/src/addresses.ts) is authorised as
 * freshness issuer for the live credential groups.
 */

import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

const GROUP_IDS = {
  KYC_VERIFIED: 25,
  ACCREDITED_INVESTOR: 26,
  HK_RESIDENT: 27,
  SG_RESIDENT: 28,
  AE_RESIDENT: 29,
};

const VERIFIER_SRC = path.resolve(
  __dirname,
  "..",
  "contracts",
  "freshness",
  "FreshnessVerifier.sol"
);

async function main() {
  if (!fs.existsSync(VERIFIER_SRC)) {
    throw new Error(
      `FreshnessVerifier.sol not found at ${VERIFIER_SRC}. ` +
        `Run \`node circuits/scripts/build.js\` to compile the circuit and emit the verifier first.`
    );
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const network = await ethers.provider.getNetwork();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network:  chainId=${network.chainId}`);
  console.log(`Balance:  ${ethers.formatEther(balance)}\n`);

  // Load DEMO_ISSUER from the SDK's deployment record — single source of truth.
  const sdkAddresses = await import(
    "../../sdk/src/addresses"
  ).catch(() => require("../../sdk/src/addresses"));
  const deployment = sdkAddresses.DEPLOYMENTS?.["hashkey-testnet"];
  const demoIssuerAddress: string | undefined = deployment?.contracts?.demoIssuer;
  if (!demoIssuerAddress) {
    console.warn(
      "WARN: DemoIssuer address not found in sdk/src/addresses.ts; skipping issuer authorisation. " +
        "Authorise manually after deploy via `registry.authorizeIssuer(groupId, issuer)`."
    );
  }

  console.log("--- 1/3 FreshnessRegistry ---");
  const Registry = await ethers.getContractFactory("FreshnessRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log(`  FreshnessRegistry: ${registryAddr}`);

  console.log("\n--- 2/3 FreshnessVerifier ---");
  const Verifier = await ethers.getContractFactory("FreshnessVerifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log(`  FreshnessVerifier: ${verifierAddr}`);

  console.log("\n--- 3/3 HSKPassportFreshness ---");
  const Composer = await ethers.getContractFactory("HSKPassportFreshness");
  const composer = await Composer.deploy(registryAddr, verifierAddr);
  await composer.waitForDeployment();
  const composerAddr = await composer.getAddress();
  console.log(`  HSKPassportFreshness: ${composerAddr}`);

  if (demoIssuerAddress) {
    console.log(`\n--- Authorising DemoIssuer (${demoIssuerAddress}) ---`);
    for (const [name, groupId] of Object.entries(GROUP_IDS)) {
      const tx = await registry.authorizeIssuer(groupId, demoIssuerAddress);
      await tx.wait();
      console.log(`  ${name} (${groupId}): authorised`);
    }
  }

  const deployment_record = {
    network: `chainId-${network.chainId}`,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      freshnessRegistry: registryAddr,
      freshnessVerifier: verifierAddr,
      hskPassportFreshness: composerAddr,
    },
    groupIds: GROUP_IDS,
    demoIssuer: demoIssuerAddress ?? null,
  };

  const outDir = path.resolve(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `freshness-${network.chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment_record, null, 2));

  console.log(`\nDeployment record: ${outFile}`);
  console.log("\nNext steps:");
  console.log("  1. Issue a test credential using the backend auto-issuer so a leaf is inserted.");
  console.log("  2. From the frontend, generate a freshness proof and call verifyFresh on the composer.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
