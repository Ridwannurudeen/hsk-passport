// Phase A3 step 2 — execute the test proposal scheduled by
// schedule-timelock-test.ts, after the 48h delay has elapsed. If this call
// reverts, STOP — do not proceed to Phase B (ownership transfer).
//
// The script reads its inputs from deployments/mainnet-timelock-test-<chainId>.json
// so the salt and call data match exactly what was scheduled.
//
// Usage:
//   npx hardhat run --network hashkey-mainnet scripts/execute-timelock-test.ts

import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  if (network.name !== "hashkey-mainnet") {
    throw new Error(`Refusing to run on "${network.name}". Use --network hashkey-mainnet.`);
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const recordPath = path.resolve(__dirname, "..", "deployments", `mainnet-timelock-test-${chainId}.json`);
  if (!fs.existsSync(recordPath)) {
    throw new Error(`Test-proposal record missing: ${recordPath}. Run schedule-timelock-test.ts first.`);
  }
  const r = JSON.parse(fs.readFileSync(recordPath, "utf8")) as {
    timelock: string;
    target: string;
    callData: string;
    predecessor: string;
    salt: string;
    operationHash: string;
    executableAt: string;
  };

  const [signer] = await ethers.getSigners();
  const timelock = await ethers.getContractAt("HSKPassportTimelock", r.timelock, signer);

  // Pre-flight: check the operation is actually ready to execute. The OZ
  // timelock would revert with TimelockUnexpectedOperationState, but the error
  // is cryptic — better to fail with a clear message here.
  const isReady: boolean = await timelock.isOperationReady(r.operationHash);
  const isDone: boolean = await timelock.isOperationDone(r.operationHash);
  const ready: bigint = await timelock.getTimestamp(r.operationHash);
  const now = BigInt(Math.floor(Date.now() / 1000));

  console.log("Network:        ", network.name, `(chain ${chainId})`);
  console.log("Timelock:       ", r.timelock);
  console.log("Operation hash: ", r.operationHash);
  console.log("Executable at:  ", r.executableAt);
  console.log("isOperationReady:", isReady);
  console.log("isOperationDone: ", isDone);
  console.log("Now (unix):     ", now.toString());
  console.log("Ready (unix):   ", ready.toString());

  if (isDone) {
    console.log("\nOperation already executed — nothing to do.");
    return;
  }
  if (!isReady) {
    const wait = Number(ready - now);
    throw new Error(
      `Operation not yet ready. Wait ${wait > 0 ? wait : 0} more seconds (~${Math.ceil((wait > 0 ? wait : 0) / 3600)} hours).`,
    );
  }

  console.log("\n--- Executing on-chain ---");
  const tx = await timelock.execute(r.target, 0n, r.callData, r.predecessor, r.salt);
  const receipt = await tx.wait();
  console.log("  tx:    ", tx.hash);
  console.log("  status:", receipt?.status === 1 ? "success" : "reverted");

  if (receipt?.status !== 1) {
    throw new Error("Test execution reverted. Do NOT proceed to Phase B.");
  }

  console.log("\nTest proposal executed successfully. Timelock can call IssuerRegistry methods.");
  console.log("Next: HANDOFF_PHASE=ownership npx hardhat run --network hashkey-mainnet \\");
  console.log("       scripts/handoff-mainnet-issuer-registry.ts");
  console.log("       (THIS IS IRREVERSIBLE)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
