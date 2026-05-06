// Hand off control of the mainnet IssuerRegistry to HSKPassportTimelock.
//
// Two-phase rollout to avoid bricking the registry:
//
//   Phase 1 (HANDOFF_PHASE=slashing — DEFAULT):
//     - Transfer slashingAuthority to the timelock.
//     - Owner remains the deployer EOA, so we can still recover slashing
//       authority by calling setSlashingAuthority(deployer) directly if the
//       timelock turns out to be misconfigured. Slashing now requires a 48h
//       scheduled call.
//
//   Phase 2 (HANDOFF_PHASE=ownership):
//     - Transfer owner() to the timelock.
//     - This is IRREVERSIBLE — IssuerRegistry.transferOwnership has no
//       acceptOwnership step. After this, every parameter change
//       (setStakeRequirements, setSlashingAuthority, setUnstakeCooldown) must
//       go through the 48h timelock.
//     - Run only AFTER Phase 1 has been live for at least one full slashing
//       cycle (or one verified test proposal — see RUNBOOK).
//
// Usage:
//   HANDOFF_PHASE=slashing  npx hardhat run --network hashkey-mainnet scripts/handoff-mainnet-issuer-registry.ts
//   HANDOFF_PHASE=ownership npx hardhat run --network hashkey-mainnet scripts/handoff-mainnet-issuer-registry.ts

import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

const MAINNET_ISSUER_REGISTRY = "0xf109cBe3D8d54D77C85ECF1367Cfcd6f075868e9";

async function main() {
  if (network.name !== "hashkey-mainnet") {
    throw new Error(
      `Refusing to run mainnet handoff on network "${network.name}". Use --network hashkey-mainnet.`,
    );
  }

  const phase = (process.env.HANDOFF_PHASE || "slashing").toLowerCase();
  if (phase !== "slashing" && phase !== "ownership") {
    throw new Error(`HANDOFF_PHASE must be "slashing" or "ownership" (got "${phase}")`);
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const recordPath = path.resolve(
    __dirname,
    "..",
    "deployments",
    `mainnet-timelock-${chainId}.json`,
  );
  if (!fs.existsSync(recordPath)) {
    throw new Error(
      `Mainnet timelock deployment record not found at ${recordPath}. ` +
        "Run scripts/deploy-mainnet-timelock.ts first.",
    );
  }
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8")) as {
    timelock: string;
    minDelaySec: number;
  };
  const timelockAddr = record.timelock;

  const [signer] = await ethers.getSigners();
  console.log("Network:           ", network.name, `(chain ${chainId})`);
  console.log("Signer:            ", signer.address);
  console.log("IssuerRegistry:    ", MAINNET_ISSUER_REGISTRY);
  console.log("Timelock target:   ", timelockAddr);
  console.log("Phase:             ", phase, "\n");

  const registry = await ethers.getContractAt("IssuerRegistry", MAINNET_ISSUER_REGISTRY, signer);
  const currentOwner: string = await registry.owner();
  const currentSlashingAuthority: string = await registry.slashingAuthority();
  console.log("On-chain state BEFORE:");
  console.log("  owner:             ", currentOwner);
  console.log("  slashingAuthority: ", currentSlashingAuthority);

  if (currentOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer ${signer.address} is not the registry owner (${currentOwner}). ` +
        "If ownership has already been transferred, this script is no longer applicable.",
    );
  }

  if (phase === "slashing") {
    if (currentSlashingAuthority.toLowerCase() === timelockAddr.toLowerCase()) {
      console.log("\nSlashing authority is already the timelock — nothing to do.");
      return;
    }
    console.log("\n--- Transferring slashingAuthority → timelock ---");
    const tx = await registry.setSlashingAuthority(timelockAddr);
    await tx.wait();
    console.log("  tx:", tx.hash);
  } else {
    // ownership phase
    if (currentOwner.toLowerCase() === timelockAddr.toLowerCase()) {
      console.log("\nOwner is already the timelock — nothing to do.");
      return;
    }
    console.log("\n--- IRREVERSIBLE: transferring owner → timelock ---");
    console.log("  This blocks all owner-only calls behind a 48h timelock from now on.");
    const tx = await registry.transferOwnership(timelockAddr);
    await tx.wait();
    console.log("  tx:", tx.hash);
  }

  const newOwner: string = await registry.owner();
  const newSlashingAuthority: string = await registry.slashingAuthority();
  console.log("\nOn-chain state AFTER:");
  console.log("  owner:             ", newOwner);
  console.log("  slashingAuthority: ", newSlashingAuthority);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
