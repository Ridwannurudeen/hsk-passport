// Read-only verification of the safe-mode HSKPassport mainnet deployment.
// Reads state from all 4 contracts, asserts the safe-mode invariants, and exits 0/1.
//
// Does NOT broadcast any transactions. Safe to run at any time.
//
// Usage:
//   npx hardhat run --network hashkey-mainnet scripts/verify-mainnet-passport.ts

import { ethers, network } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  if (network.name !== "hashkey-mainnet") {
    throw new Error(`Refusing to run on ${network.name}. Use --network hashkey-mainnet.`);
  }

  const recordPath = join(__dirname, "..", "deployments", "mainnet-passport-177.json");
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  const { HSKPassport, Semaphore, SemaphoreVerifier, PoseidonT3 } = record.contracts;
  const deployer = record.deployer;
  const random = "0x000000000000000000000000000000000000dEaD";

  console.log("Network:        ", network.name, `(chain ${(await ethers.provider.getNetwork()).chainId})`);
  console.log("Reading state from", record.contracts.HSKPassport, "\n");

  let pass = 0;
  let fail = 0;
  const check = (label: string, ok: boolean, got: any, want: any) => {
    if (ok) {
      console.log(`  ✓ ${label}: ${got}`);
      pass++;
    } else {
      console.log(`  ✗ ${label}: got ${got}, want ${want}`);
      fail++;
    }
  };

  // ---- Bytecode presence ----
  console.log("[1/4] Bytecode presence");
  for (const [name, addr] of Object.entries(record.contracts)) {
    const code = await ethers.provider.getCode(addr as string);
    check(`${name} has bytecode`, code !== "0x" && code.length > 4, `${code.length} bytes`, "non-empty");
  }

  // ---- HSKPassport state ----
  console.log("\n[2/4] HSKPassport state");
  const passport = await ethers.getContractAt("HSKPassport", HSKPassport);
  const owner = await passport.owner();
  const pendingOwner = await passport.pendingOwner();
  const sem = await passport.semaphore();
  const deployerApproved = await passport.approvedIssuers(deployer);
  const randomApproved = await passport.approvedIssuers(random);
  const pauser = await passport.pauser();
  const isPaused = await passport.paused();
  const deployerIssuerPaused = await passport.issuerPaused(deployer);

  check("owner == deployer", owner.toLowerCase() === deployer.toLowerCase(), owner, deployer);
  check("pendingOwner == address(0)", pendingOwner === ethers.ZeroAddress, pendingOwner, ethers.ZeroAddress);
  check("semaphore wired correctly", sem.toLowerCase() === Semaphore.toLowerCase(), sem, Semaphore);
  check("approvedIssuers[deployer] == true", deployerApproved === true, deployerApproved, true);
  check("approvedIssuers[random] == false", randomApproved === false, randomApproved, false);
  check("pauser == deployer", pauser.toLowerCase() === deployer.toLowerCase(), pauser, deployer);
  check("paused == false", isPaused === false, isPaused, false);
  check("issuerPaused[deployer] == false", deployerIssuerPaused === false, deployerIssuerPaused, false);

  // ---- Inert-state invariants ----
  console.log("\n[3/4] Inert-state invariants (safe-mode)");
  // groupIds is a public dynamic array; index 0 should revert if empty
  let groupCount = 0;
  try {
    while (true) {
      await passport.groupIds(groupCount);
      groupCount++;
      if (groupCount > 100) break; // safety bound
    }
  } catch {
    // expected: array index OOB
  }
  check("0 credential groups", groupCount === 0, groupCount, 0);

  // ---- Semaphore wiring ----
  console.log("\n[4/4] Semaphore wiring");
  const semaphore = await ethers.getContractAt("Semaphore", Semaphore);
  const semVerifier = await semaphore.verifier();
  check(
    "Semaphore.verifier == SemaphoreVerifier",
    semVerifier.toLowerCase() === SemaphoreVerifier.toLowerCase(),
    semVerifier,
    SemaphoreVerifier,
  );

  // ---- Summary ----
  console.log(`\n${pass + fail} checks: ${pass} pass, ${fail} fail`);
  if (fail > 0) {
    process.exit(1);
  }
  console.log("\n✓ Safe-mode posture verified. Contract is inert and correctly wired.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
