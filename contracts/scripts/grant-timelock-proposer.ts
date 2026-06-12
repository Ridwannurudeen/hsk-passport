// Hand the mainnet HSKPassportTimelock's proposer duties to a 3-of-5 Gnosis Safe.
//
// The timelock was deployed with admin = address(0) (deploy-mainnet-timelock.ts),
// so it is self-administered: role changes must go through a 48h timelock self-call,
// not a direct grantRole EOA tx. The deployer is the current sole PROPOSER, so the
// deployer schedules a batch that grants PROPOSER_ROLE + CANCELLER_ROLE to the Safe
// (OZ TimelockController grants both to every proposer at construction, lines 126-127
// — the Safe needs CANCELLER too so it can cancel a bad scheduled op).
//
// Two phases, mirroring schedule/execute-timelock-test.ts:
//   GRANT_PHASE=schedule SAFE_ADDRESS=0x<safe> — deployer schedules the batch.
//       Records salt/op hash to deployments/mainnet-grant-proposer-<chainId>.json.
//   GRANT_PHASE=execute  — after 48h, anyone executes the batch. The Safe then holds
//       PROPOSER_ROLE + CANCELLER_ROLE.
//
// This grants the Safe; it does NOT revoke the deployer's roles. Revoke the deployer
// only AFTER the Safe is confirmed working as a proposer (see docs/gnosis-safe-setup.md).
//
// Usage:
//   GRANT_PHASE=schedule SAFE_ADDRESS=0x<safe> npx hardhat run --network hashkey-mainnet scripts/grant-timelock-proposer.ts
//   GRANT_PHASE=execute  npx hardhat run --network hashkey-mainnet scripts/grant-timelock-proposer.ts

import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  if (network.name !== "hashkey-mainnet") {
    throw new Error(
      `Refusing to run on "${network.name}". Use --network hashkey-mainnet.`,
    );
  }
  const phase = process.env.GRANT_PHASE;
  if (phase !== "schedule" && phase !== "execute") {
    throw new Error("Set GRANT_PHASE=schedule or GRANT_PHASE=execute.");
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const tlPath = path.resolve(
    __dirname,
    "..",
    "deployments",
    `mainnet-timelock-${chainId}.json`,
  );
  if (!fs.existsSync(tlPath)) {
    throw new Error(
      `Timelock deployment record missing: ${tlPath}. Run deploy-mainnet-timelock.ts first.`,
    );
  }
  const tlRecord = JSON.parse(fs.readFileSync(tlPath, "utf8")) as {
    timelock: string;
  };
  const timelockAddr = tlRecord.timelock;

  const [signer] = await ethers.getSigners();
  const timelock = await ethers.getContractAt(
    "HSKPassportTimelock",
    timelockAddr,
    signer,
  );
  const recordPath = path.resolve(
    __dirname,
    "..",
    "deployments",
    `mainnet-grant-proposer-${chainId}.json`,
  );

  if (phase === "schedule") {
    const safe = process.env.SAFE_ADDRESS;
    if (!safe || !ethers.isAddress(safe)) {
      throw new Error("Set SAFE_ADDRESS to the 3-of-5 Safe address (0x…).");
    }

    const PROPOSER_ROLE: string = await timelock.PROPOSER_ROLE();
    const CANCELLER_ROLE: string = await timelock.CANCELLER_ROLE();

    // The deployer must currently be a proposer to schedule, or this reverts.
    if (!(await timelock.hasRole(PROPOSER_ROLE, signer.address))) {
      throw new Error(
        `${signer.address} lacks PROPOSER_ROLE on the timelock — cannot schedule.`,
      );
    }
    if (await timelock.hasRole(PROPOSER_ROLE, safe)) {
      console.log(
        `Safe ${safe} already has PROPOSER_ROLE — nothing to schedule.`,
      );
      return;
    }

    // Batch: timelock.grantRole(PROPOSER_ROLE, safe) + grantRole(CANCELLER_ROLE, safe).
    const targets = [timelockAddr, timelockAddr];
    const values = [0n, 0n];
    const payloads = [
      timelock.interface.encodeFunctionData("grantRole", [PROPOSER_ROLE, safe]),
      timelock.interface.encodeFunctionData("grantRole", [
        CANCELLER_ROLE,
        safe,
      ]),
    ];
    const predecessor = ethers.ZeroHash;
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const minDelay: bigint = await timelock.getMinDelay();
    const opHash: string = await timelock.hashOperationBatch(
      targets,
      values,
      payloads,
      predecessor,
      salt,
    );

    console.log("Network:        ", network.name, `(chain ${chainId})`);
    console.log("Timelock:       ", timelockAddr);
    console.log("Safe:           ", safe);
    console.log("Granting:       ", "PROPOSER_ROLE + CANCELLER_ROLE");
    console.log("Salt:           ", salt);
    console.log("Operation hash: ", opHash);
    console.log("Delay:          ", minDelay.toString(), "sec\n");

    console.log("--- Scheduling on-chain ---");
    const tx = await timelock.scheduleBatch(
      targets,
      values,
      payloads,
      predecessor,
      salt,
      minDelay,
    );
    await tx.wait();
    console.log("  tx:", tx.hash);

    const ready: bigint = await timelock.getTimestamp(opHash);
    const readyDate = new Date(Number(ready) * 1000).toISOString();
    console.log(
      "\nExecutable at:   ",
      readyDate,
      "(unix",
      ready.toString(),
      ")",
    );

    fs.writeFileSync(
      recordPath,
      JSON.stringify(
        {
          scheduledAt: new Date().toISOString(),
          scheduledBy: signer.address,
          timelock: timelockAddr,
          safe,
          targets,
          values: ["0", "0"],
          payloads,
          predecessor,
          salt,
          operationHash: opHash,
          delaySec: Number(minDelay),
          executableAt: readyDate,
          scheduleTx: tx.hash,
        },
        null,
        2,
      ),
    );
    console.log(`\nState saved to: ${recordPath}`);
    console.log(
      `\nNext: wait until ${readyDate}, then run GRANT_PHASE=execute.`,
    );
    return;
  }

  // phase === "execute"
  if (!fs.existsSync(recordPath)) {
    throw new Error(
      `Grant record missing: ${recordPath}. Run GRANT_PHASE=schedule first.`,
    );
  }
  const r = JSON.parse(fs.readFileSync(recordPath, "utf8")) as {
    safe: string;
    targets: string[];
    values: string[];
    payloads: string[];
    predecessor: string;
    salt: string;
    operationHash: string;
    executableAt: string;
  };

  const isReady: boolean = await timelock.isOperationReady(r.operationHash);
  const isDone: boolean = await timelock.isOperationDone(r.operationHash);
  const ready: bigint = await timelock.getTimestamp(r.operationHash);
  const now = BigInt(Math.floor(Date.now() / 1000));

  console.log("Network:        ", network.name, `(chain ${chainId})`);
  console.log("Timelock:       ", timelockAddr);
  console.log("Safe:           ", r.safe);
  console.log("Operation hash: ", r.operationHash);
  console.log("Executable at:  ", r.executableAt);
  console.log("isOperationReady:", isReady);
  console.log("isOperationDone: ", isDone);

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
  const tx = await timelock.executeBatch(
    r.targets,
    r.values.map((v) => BigInt(v)),
    r.payloads,
    r.predecessor,
    r.salt,
  );
  const receipt = await tx.wait();
  console.log("  tx:    ", tx.hash);
  console.log("  status:", receipt?.status === 1 ? "success" : "reverted");
  if (receipt?.status !== 1) {
    throw new Error(
      "Grant execution reverted. The Safe was NOT granted the roles.",
    );
  }

  const PROPOSER_ROLE: string = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE: string = await timelock.CANCELLER_ROLE();
  const hasProposer = await timelock.hasRole(PROPOSER_ROLE, r.safe);
  const hasCanceller = await timelock.hasRole(CANCELLER_ROLE, r.safe);
  console.log("\nSafe PROPOSER_ROLE: ", hasProposer);
  console.log("Safe CANCELLER_ROLE:", hasCanceller);
  if (!hasProposer || !hasCanceller) {
    throw new Error(
      "Post-check failed: Safe does not hold both roles. STOP and investigate.",
    );
  }
  console.log(
    "\nSafe is now a proposer. Validate it can schedule (Phase B2 test), then",
  );
  console.log(
    "revoke the deployer's PROPOSER_ROLE before the ownership handoff (Phase B4).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
