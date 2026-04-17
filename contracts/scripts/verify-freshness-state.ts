import { ethers } from "hardhat";

async function main() {
  const registry = await ethers.getContractAt(
    "FreshnessRegistry",
    "0xd251ecAD1a863299BAD2E25B93377B736a753938"
  );
  const composer = await ethers.getContractAt(
    "HSKPassportFreshness",
    "0xFF790dE1537a84220cD12ef648650034D4725fBb"
  );
  const root = await registry.currentRoot(25);
  const leafCount = await registry.leafCount(25);
  const composerRegistry = await composer.registry();
  const composerVerifier = await composer.verifier();
  console.log("=== FreshnessRegistry ===");
  console.log("  currentRoot(25):", root.toString());
  console.log("  leafCount(25):  ", leafCount.toString());
  console.log("");
  console.log("=== HSKPassportFreshness ===");
  console.log("  registry:", composerRegistry);
  console.log("  verifier:", composerVerifier);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
