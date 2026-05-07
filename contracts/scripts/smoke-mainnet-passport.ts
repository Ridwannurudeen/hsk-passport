// Mainnet write-path smoke test: prove pause/unpause works end-to-end against
// the real chain 177 EVM, not just Hardhat's local EVM.
//
// Test sequence (2 txs, returns to identical safe-mode state):
//   1. assert paused == false (initial)
//   2. pause() — pauser-only, deployer is pauser
//   3. assert paused == true
//   4. unpause() — owner-only, deployer is owner
//   5. assert paused == false (final, identical to initial)
//
// Aborts immediately on any failed assertion. Safe to re-run.
//
// Usage:
//   npx hardhat run --network hashkey-mainnet scripts/smoke-mainnet-passport.ts

import { ethers, network } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  if (network.name !== "hashkey-mainnet") {
    throw new Error(`Refusing to run on ${network.name}. Use --network hashkey-mainnet.`);
  }

  const recordPath = join(__dirname, "..", "deployments", "mainnet-passport-177.json");
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  const passportAddr = record.contracts.HSKPassport;

  const [signer] = await ethers.getSigners();
  const passport = await ethers.getContractAt("HSKPassport", passportAddr, signer);

  console.log("Network: ", network.name);
  console.log("Caller:  ", signer.address);
  console.log("Target:  ", passportAddr, "\n");

  // Pre-flight: caller must be both pauser and owner
  const owner = await passport.owner();
  const pauser = await passport.pauser();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`signer ${signer.address} is not owner ${owner}`);
  }
  if (pauser.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`signer ${signer.address} is not pauser ${pauser}`);
  }

  // Step 1: assert initial paused == false
  console.log("[1/5] Initial state");
  let isPaused = await passport.paused();
  if (isPaused !== false) {
    throw new Error(`expected paused=false initially, got ${isPaused}`);
  }
  console.log("  ✓ paused == false\n");

  // Step 2: pause()
  console.log("[2/5] pause()");
  const pauseTx = await passport.pause();
  console.log("  tx:", pauseTx.hash);
  const pauseRc = await pauseTx.wait();
  console.log("  block:", pauseRc.blockNumber, "gas:", pauseRc.gasUsed.toString());
  const pausedEvent = pauseRc.logs.find(
    (l: any) => l.fragment?.name === "Paused",
  );
  if (!pausedEvent) {
    throw new Error("Paused event not emitted");
  }
  console.log("  ✓ Paused event emitted\n");

  // Step 3: assert paused == true
  console.log("[3/5] State after pause");
  isPaused = await passport.paused();
  if (isPaused !== true) {
    throw new Error(`expected paused=true after pause(), got ${isPaused}`);
  }
  console.log("  ✓ paused == true\n");

  // Step 4: unpause()
  console.log("[4/5] unpause()");
  const unpauseTx = await passport.unpause();
  console.log("  tx:", unpauseTx.hash);
  const unpauseRc = await unpauseTx.wait();
  console.log("  block:", unpauseRc.blockNumber, "gas:", unpauseRc.gasUsed.toString());
  const unpausedEvent = unpauseRc.logs.find(
    (l: any) => l.fragment?.name === "Unpaused",
  );
  if (!unpausedEvent) {
    throw new Error("Unpaused event not emitted");
  }
  console.log("  ✓ Unpaused event emitted\n");

  // Step 5: assert final paused == false (matches initial)
  console.log("[5/5] Final state");
  isPaused = await passport.paused();
  if (isPaused !== false) {
    throw new Error(`expected paused=false after unpause(), got ${isPaused}`);
  }
  console.log("  ✓ paused == false (returned to safe-mode)\n");

  console.log("✓ Mainnet pause/unpause write-path verified end-to-end.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
