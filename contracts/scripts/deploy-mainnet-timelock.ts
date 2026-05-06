// Deploy HSKPassportTimelock on HashKey Chain mainnet (chain 177).
//
// Soft-mainnet posture: 1-of-1 timelock. The deployer EOA is the sole proposer
// and executor; admin role is set to the timelock itself (admin = address(0)
// in the constructor) so that any future role changes (adding a Safe proposer,
// rotating executors) must go through the 48h timelock self-call.
//
// Once you have real independent co-signers, schedule a call from this timelock
// to grant PROPOSER_ROLE to a Safe — that's a one-tx upgrade, no redeploy.
//
// Usage:
//   npx hardhat run --network hashkey-mainnet scripts/deploy-mainnet-timelock.ts
//
// Pre-flight: deployer wallet must hold mainnet HSK gas. Estimated deploy cost
// ~2.6M gas × 0.001 gwei ≈ 0.0000026 HSK.

import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  if (network.name !== "hashkey-mainnet") {
    throw new Error(
      `Refusing to run mainnet deploy on network "${network.name}". Use --network hashkey-mainnet.`,
    );
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  console.log("Network:    ", network.name, `(chain ${chainId})`);
  console.log("Deployer:   ", deployer.address);
  console.log("Balance:    ", ethers.formatEther(balance), "HSK");

  if (balance === 0n) {
    throw new Error(`Deployer ${deployer.address} has 0 HSK on mainnet. Fund it before running.`);
  }

  const proposers = [deployer.address];
  const executors = [deployer.address];
  const admin = ethers.ZeroAddress; // no admin override — all role changes via timelock self-call

  console.log("\n--- Deploying HSKPassportTimelock ---");
  console.log("  proposers:   ", proposers);
  console.log("  executors:   ", executors);
  console.log("  admin:       ", admin === ethers.ZeroAddress ? "0x0 (lock to self)" : admin);
  console.log("  minDelay:    ", "48h (hardcoded in contract)");

  const Timelock = await ethers.getContractFactory("HSKPassportTimelock");
  const timelock = await Timelock.deploy(proposers, executors, admin);
  await timelock.waitForDeployment();
  const addr = await timelock.getAddress();
  const tx = timelock.deploymentTransaction();
  console.log("  Address:    ", addr);
  console.log("  Tx hash:    ", tx?.hash);

  // Sanity-read the on-chain state.
  const minDelay = await timelock.getMinDelay();
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const isProposer = await timelock.hasRole(PROPOSER_ROLE, deployer.address);
  const isExecutor = await timelock.hasRole(EXECUTOR_ROLE, deployer.address);
  console.log("\nOn-chain state:");
  console.log("  minDelay:        ", minDelay.toString(), "sec");
  console.log("  deployer proposer:", isProposer);
  console.log("  deployer executor:", isExecutor);

  const balanceAfter = await ethers.provider.getBalance(deployer.address);
  console.log("\nGas spent:", ethers.formatEther(balance - balanceAfter), "HSK");

  // Persist the address for the handoff script.
  const recordPath = path.resolve(
    __dirname,
    "..",
    "deployments",
    `mainnet-timelock-${chainId}.json`,
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
        timelock: addr,
        deployTx: tx?.hash,
        minDelaySec: Number(minDelay),
      },
      null,
      2,
    ),
  );
  console.log(`\nDeployment record: ${recordPath}`);
  console.log("\nNext: run scripts/handoff-mainnet-issuer-registry.ts to wire the IssuerRegistry to this timelock.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
