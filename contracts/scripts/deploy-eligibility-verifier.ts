// Deploy the policy-level HSKEligibilityVerifier.
//
// This is additive: it does not mutate HSKPassport, FreshnessRegistry, or any
// issuer permissions. dApps register policies on the deployed verifier and then
// call requireEligible(policyId, proof, msg.sender) from their own contracts.

import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

async function loadDefaultAddress(name: "hskPassport" | "hskPassportFreshness") {
  const sdkAddresses = await import(
    "../../sdk/src/addresses"
  ).catch(() => require("../../sdk/src/addresses"));
  return sdkAddresses.DEPLOYMENTS?.["hashkey-testnet"]?.contracts?.[name] as string | undefined;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const balance = await ethers.provider.getBalance(deployer.address);

  const passport =
    process.env.HSK_PASSPORT_ADDRESS ?? (await loadDefaultAddress("hskPassport"));
  const freshness =
    process.env.HSK_PASSPORT_FRESHNESS_ADDRESS ?? (await loadDefaultAddress("hskPassportFreshness"));

  if (!passport) throw new Error("HSK_PASSPORT_ADDRESS is required");

  console.log("Network:   ", network.name, `(chain ${chainId})`);
  console.log("Deployer:  ", deployer.address);
  console.log("Balance:   ", ethers.formatEther(balance), "HSK");
  console.log("Passport:  ", passport);
  console.log("Freshness: ", freshness ?? ethers.ZeroAddress, "\n");

  const Verifier = await ethers.getContractFactory("HSKEligibilityVerifier");
  const verifier = await Verifier.deploy(passport, freshness ?? ethers.ZeroAddress);
  await verifier.waitForDeployment();

  const verifierAddress = await verifier.getAddress();
  const tx = verifier.deploymentTransaction();
  console.log("HSKEligibilityVerifier:", verifierAddress);
  console.log("Tx:                    ", tx?.hash);

  const outDir = path.resolve(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `eligibility-verifier-${chainId}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        network: `chainId-${chainId}`,
        chainId: Number(chainId),
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        hskPassport: passport,
        hskPassportFreshness: freshness ?? ethers.ZeroAddress,
        hskEligibilityVerifier: verifierAddress,
        deployTx: tx?.hash,
      },
      null,
      2,
    ),
  );

  console.log(`\nDeployment record: ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
