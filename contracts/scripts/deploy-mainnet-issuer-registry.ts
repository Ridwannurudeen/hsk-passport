// Deploy ONLY the IssuerRegistry contract on HashKey Chain mainnet (chain 177).
// Soft-mainnet posture: real-money issuer staking on mainnet, while credentials
// and KYC continue to issue on testnet pending third-party audit.
//
// Usage:
//   npx hardhat run --network hashkey-mainnet scripts/deploy-mainnet-issuer-registry.ts
//
// Pre-flight: deployer wallet (PRIVATE_KEY in contracts/.env) must hold mainnet
// HSK gas. Estimated deploy cost ~1.3M gas × 0.001 gwei ~= 0.0000013 HSK.

import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  if (network.name !== "hashkey-mainnet") {
    throw new Error(
      `Refusing to run mainnet deploy on network "${network.name}". ` +
        "Use --network hashkey-mainnet.",
    );
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const { chainId } = await ethers.provider.getNetwork();
  console.log(
    "Network:        ",
    network.name,
    "(chain",
    chainId.toString() + ")",
  );
  console.log("Deployer:       ", deployer.address);
  console.log("Balance:        ", ethers.formatEther(balance), "HSK");

  if (balance === 0n) {
    throw new Error(
      `Deployer ${deployer.address} has 0 HSK on mainnet. Fund it before running.`,
    );
  }

  // Treasury receives slashed stake — immutable, set at construction. Defaults to
  // the deployer; override with TREASURY for a dedicated multisig/treasury address.
  const treasury = process.env.TREASURY || deployer.address;
  console.log(
    "Treasury:       ",
    treasury,
    process.env.TREASURY ? "" : "(deployer — set TREASURY to override)",
  );

  console.log("\nDeploying IssuerRegistry...");
  const Registry = await ethers.getContractFactory("IssuerRegistry");
  const registry = await Registry.deploy(treasury);
  await registry.waitForDeployment();
  const addr = await registry.getAddress();
  const tx = registry.deploymentTransaction();
  console.log("  Address:       ", addr);
  console.log("  Tx hash:       ", tx?.hash);

  // Sanity-read the defaults so we know the contract is alive on-chain.
  const community = await registry.communityMinStake();
  const kyc = await registry.kycProviderMinStake();
  const inst = await registry.institutionalMinStake();
  const cooldown = await registry.unstakeCooldown();
  const owner = await registry.owner();
  console.log("\nOn-chain state:");
  console.log("  owner:                 ", owner);
  console.log(
    "  communityMinStake:     ",
    ethers.formatEther(community),
    "HSK",
  );
  console.log("  kycProviderMinStake:   ", ethers.formatEther(kyc), "HSK");
  console.log("  institutionalMinStake: ", ethers.formatEther(inst), "HSK");
  console.log("  unstakeCooldown:       ", cooldown.toString(), "sec");

  const balanceAfter = await ethers.provider.getBalance(deployer.address);
  console.log(
    "\nGas spent:",
    ethers.formatEther(balance - balanceAfter),
    "HSK",
  );

  // Persist the deployment record (the rewire step + handoff scripts consume it).
  const recordPath = path.resolve(
    __dirname,
    "..",
    "deployments",
    `mainnet-issuer-registry-${chainId}.json`,
  );
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(
    recordPath,
    JSON.stringify(
      {
        network: `chainId-${chainId}`,
        chainId: Number(chainId),
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        issuerRegistry: addr,
        treasury,
        deployTx: tx?.hash,
        supersedes: "0xf109cBe3D8d54D77C85ECF1367Cfcd6f075868e9",
      },
      null,
      2,
    ),
  );
  console.log(`\nDeployment record: ${recordPath}`);

  console.log("\n=== Save this for the frontend/backend wiring ===");
  console.log("MAINNET_ISSUER_REGISTRY=" + addr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
