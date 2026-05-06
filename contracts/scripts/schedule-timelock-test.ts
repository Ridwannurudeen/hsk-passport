// Phase A3 step 1 — schedule a no-op test proposal through the mainnet
// HSKPassportTimelock to prove the timelock can call IssuerRegistry methods
// before we hand it ownership.
//
// The test proposal is `IssuerRegistry.slash(deployer, 0, "timelock-test")`:
//   - slashingAuthority is now the timelock (Phase A2), so the timelock has
//     authority to call slash().
//   - amount=0 means slashed=0 — no economic effect, just an event emission.
//   - target is the deployer's own staked issuer entry (the only one on
//     mainnet at the time of writing).
//
// Records the operation params to deployments/mainnet-timelock-test-177.json
// so execute-timelock-test.ts can read them back after the 48h delay.
//
// Usage (broadcasts ONE mainnet tx, ~70k gas):
//   npx hardhat run --network hashkey-mainnet scripts/schedule-timelock-test.ts

import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

const ISSUER_REGISTRY = "0xf109cBe3D8d54D77C85ECF1367Cfcd6f075868e9";
const REASON = "timelock-test";

async function main() {
  if (network.name !== "hashkey-mainnet") {
    throw new Error(`Refusing to run on "${network.name}". Use --network hashkey-mainnet.`);
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const tlPath = path.resolve(__dirname, "..", "deployments", `mainnet-timelock-${chainId}.json`);
  if (!fs.existsSync(tlPath)) {
    throw new Error(`Timelock deployment record missing: ${tlPath}. Run deploy-mainnet-timelock.ts first.`);
  }
  const tlRecord = JSON.parse(fs.readFileSync(tlPath, "utf8")) as { timelock: string; minDelaySec: number };
  const timelockAddr = tlRecord.timelock;

  const [signer] = await ethers.getSigners();
  const timelock = await ethers.getContractAt("HSKPassportTimelock", timelockAddr, signer);
  const registry = await ethers.getContractAt("IssuerRegistry", ISSUER_REGISTRY, signer);

  // Sanity-check: timelock must currently be the slashingAuthority for this test
  // proposal to make sense. If A2 was reverted, this is a no-op — abort early.
  const slashingAuth: string = await registry.slashingAuthority();
  if (slashingAuth.toLowerCase() !== timelockAddr.toLowerCase()) {
    throw new Error(
      `slashingAuthority is ${slashingAuth}, not the timelock ${timelockAddr}. ` +
        "Re-run handoff-mainnet-issuer-registry.ts HANDOFF_PHASE=slashing first.",
    );
  }

  // Encode IssuerRegistry.slash(deployer, 0, "timelock-test"). The only staked
  // issuer on mainnet today is the deployer itself, so we slash ourselves by 0.
  const callData = registry.interface.encodeFunctionData("slash", [signer.address, 0, REASON]);

  // Random salt → unique operation hash. Persisted so execute-timelock-test.ts
  // can re-derive the same hash. Don't reuse a salt: timelock rejects duplicate
  // operation IDs.
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const predecessor = ethers.ZeroHash;
  const minDelay: bigint = await timelock.getMinDelay();

  const opHash: string = await timelock.hashOperation(
    ISSUER_REGISTRY,
    0n,
    callData,
    predecessor,
    salt,
  );

  console.log("Network:        ", network.name, `(chain ${chainId})`);
  console.log("Timelock:       ", timelockAddr);
  console.log("Target:         ", ISSUER_REGISTRY);
  console.log("Call:           ", `slash(${signer.address}, 0, "${REASON}")`);
  console.log("Salt:           ", salt);
  console.log("Operation hash: ", opHash);
  console.log("Delay:          ", minDelay.toString(), "sec\n");

  console.log("--- Scheduling on-chain ---");
  const tx = await timelock.schedule(
    ISSUER_REGISTRY,
    0n,
    callData,
    predecessor,
    salt,
    minDelay,
  );
  await tx.wait();
  console.log("  tx:", tx.hash);

  const ready: bigint = await timelock.getTimestamp(opHash);
  const readyDate = new Date(Number(ready) * 1000).toISOString();
  console.log("\nExecutable at:   ", readyDate, "(unix", ready.toString(), ")");

  const recordPath = path.resolve(__dirname, "..", "deployments", `mainnet-timelock-test-${chainId}.json`);
  fs.writeFileSync(
    recordPath,
    JSON.stringify(
      {
        scheduledAt: new Date().toISOString(),
        scheduledBy: signer.address,
        timelock: timelockAddr,
        target: ISSUER_REGISTRY,
        value: "0",
        callData,
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
  console.log(`\nNext: wait until ${readyDate}, then run execute-timelock-test.ts.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
