// Deploy HSKPassport on HashKey Chain mainnet (chain 177) in SAFE MODE.
//
// Safe-mode posture:
//   - Deploys: PoseidonT3, SemaphoreVerifier, Semaphore, HSKPassport.
//   - Owner = deployer EOA (sole approved issuer via constructor auto-approval).
//   - Zero credential groups created.
//   - No additional issuers approved.
//   - No dApps wired up (CredentialRegistry, DemoIssuer, GatedRWA, etc. NOT deployed).
//   - Contract is verifiable on the explorer but inert: nothing for third parties
//     to call until governance + issuers are wired post-audit.
//
// Why this is safe pre-audit:
//   - approvedIssuers contains only the deployer EOA.
//   - No groups exist, so verifyCredential reverts on every call.
//   - No real users, no real credentials, no value at risk.
//   - If a critical bug is found post-audit, redeploy clean — no state to migrate.
//
// Usage:
//   npx hardhat run --network hashkey-mainnet scripts/deploy-mainnet-passport-safemode.ts
//
// Pre-flight: PRIVATE_KEY in contracts/.env must match the deployer EOA holding
// mainnet HSK gas. Estimated cost ~10M gas × 0.001 gwei ≈ 0.00001 HSK.

import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

async function main() {
  if (network.name !== "hashkey-mainnet") {
    throw new Error(
      `Refusing to run mainnet deploy on network "${network.name}". ` +
        "Use --network hashkey-mainnet.",
    );
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  console.log("Network:        ", network.name, "(chain", chainId.toString() + ")");
  console.log("Deployer:       ", deployer.address);
  console.log("Balance:        ", ethers.formatEther(balance), "HSK");

  if (chainId !== 177n) {
    throw new Error(`Expected chain 177, got ${chainId}. Aborting.`);
  }
  if (balance === 0n) {
    throw new Error(`Deployer ${deployer.address} has 0 HSK on mainnet. Fund it before running.`);
  }

  // ---- 1. SemaphoreVerifier ----
  console.log("\n[1/4] Deploying SemaphoreVerifier...");
  const SemaphoreVerifier = await ethers.getContractFactory("SemaphoreVerifier");
  const verifier = await SemaphoreVerifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log("  Address:       ", verifierAddr);
  console.log("  Tx:            ", verifier.deploymentTransaction()?.hash);

  // ---- 2. PoseidonT3 library ----
  console.log("\n[2/4] Deploying PoseidonT3 library...");
  const PoseidonT3 = await ethers.getContractFactory("PoseidonT3");
  const poseidon = await PoseidonT3.deploy();
  await poseidon.waitForDeployment();
  const poseidonAddr = await poseidon.getAddress();
  console.log("  Address:       ", poseidonAddr);
  console.log("  Tx:            ", poseidon.deploymentTransaction()?.hash);

  // ---- 3. Semaphore (linked against PoseidonT3) ----
  console.log("\n[3/4] Deploying Semaphore...");
  const Semaphore = await ethers.getContractFactory("Semaphore", {
    libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": poseidonAddr },
  });
  const semaphore = await Semaphore.deploy(verifierAddr);
  await semaphore.waitForDeployment();
  const semaphoreAddr = await semaphore.getAddress();
  console.log("  Address:       ", semaphoreAddr);
  console.log("  Tx:            ", semaphore.deploymentTransaction()?.hash);

  // ---- 4. HSKPassport ----
  console.log("\n[4/4] Deploying HSKPassport...");
  const HSKPassport = await ethers.getContractFactory("HSKPassport");
  const passport = await HSKPassport.deploy(semaphoreAddr);
  await passport.waitForDeployment();
  const passportAddr = await passport.getAddress();
  console.log("  Address:       ", passportAddr);
  console.log("  Tx:            ", passport.deploymentTransaction()?.hash);

  // ---- Sanity-read on-chain state ----
  const owner = await passport.owner();
  const semFromContract = await passport.semaphore();
  const deployerIsApproved = await passport.approvedIssuers(deployer.address);

  console.log("\nOn-chain state (HSKPassport):");
  console.log("  owner:                  ", owner);
  console.log("  semaphore:              ", semFromContract);
  console.log("  approvedIssuers[owner]: ", deployerIsApproved);

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("FATAL: owner does not match deployer");
  }
  if (semFromContract.toLowerCase() !== semaphoreAddr.toLowerCase()) {
    throw new Error("FATAL: semaphore address mismatch");
  }
  if (!deployerIsApproved) {
    throw new Error("FATAL: deployer not auto-approved as issuer");
  }

  const balanceAfter = await ethers.provider.getBalance(deployer.address);
  console.log("\nGas spent:", ethers.formatEther(balance - balanceAfter), "HSK");

  // ---- Save deployment record ----
  const record = {
    chainId: 177,
    network: "hashkey-mainnet",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    posture: "safe-mode",
    notes: "Deployed for prize payout. Inert: 0 groups, deployer is sole approved issuer. No further issuers or groups until post-audit.",
    contracts: {
      SemaphoreVerifier: verifierAddr,
      PoseidonT3: poseidonAddr,
      Semaphore: semaphoreAddr,
      HSKPassport: passportAddr,
    },
    txs: {
      SemaphoreVerifier: verifier.deploymentTransaction()?.hash,
      PoseidonT3: poseidon.deploymentTransaction()?.hash,
      Semaphore: semaphore.deploymentTransaction()?.hash,
      HSKPassport: passport.deploymentTransaction()?.hash,
    },
  };

  const outDir = join(__dirname, "..", "deployments");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, "mainnet-passport-177.json");
  writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log("\nDeployment record written to:", outFile);

  console.log("\n=== Save this ===");
  console.log("MAINNET_HSKPASSPORT=" + passportAddr);
  console.log("MAINNET_SEMAPHORE=" + semaphoreAddr);
  console.log("MAINNET_SEMAPHORE_VERIFIER=" + verifierAddr);
  console.log("MAINNET_POSEIDON_T3=" + poseidonAddr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
