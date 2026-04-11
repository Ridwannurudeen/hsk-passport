import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "HSK");

  if (balance === 0n) {
    console.error("No balance! Fund the wallet first via https://hashkeychain.net/faucet");
    process.exit(1);
  }

  // 1. Deploy SemaphoreVerifier (already deployed, reuse if possible)
  console.log("\n1. Deploying SemaphoreVerifier...");
  const SemaphoreVerifier = await ethers.getContractFactory("SemaphoreVerifier");
  const verifier = await SemaphoreVerifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log("   SemaphoreVerifier:", verifierAddr);

  // 2. Deploy PoseidonT3 library, then link and deploy Semaphore
  console.log("\n2. Deploying PoseidonT3 + Semaphore...");
  const PoseidonT3 = await ethers.getContractFactory("PoseidonT3");
  const poseidon = await PoseidonT3.deploy();
  await poseidon.waitForDeployment();
  const poseidonAddr = await poseidon.getAddress();
  console.log("   PoseidonT3:", poseidonAddr);

  const Semaphore = await ethers.getContractFactory("Semaphore", {
    libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": poseidonAddr },
  });
  const semaphore = await Semaphore.deploy(verifierAddr);
  await semaphore.waitForDeployment();
  const semaphoreAddr = await semaphore.getAddress();
  console.log("   Semaphore:", semaphoreAddr);

  // 3. Deploy HSKPassport (with semaphore address)
  console.log("\n3. Deploying HSKPassport...");
  const HSKPassport = await ethers.getContractFactory("HSKPassport");
  const passport = await HSKPassport.deploy(semaphoreAddr);
  await passport.waitForDeployment();
  const passportAddr = await passport.getAddress();
  console.log("   HSKPassport:", passportAddr);

  // 4. Create default credential groups
  console.log("\n4. Creating credential groups...");

  const tx1 = await passport.createCredentialGroup("KYC_VERIFIED");
  const receipt1 = await tx1.wait();
  const kycGroupId = receipt1?.logs?.[0]
    ? (passport.interface.parseLog({ topics: [...receipt1.logs[0].topics], data: receipt1.logs[0].data }))?.args?.groupId
    : 0n;
  console.log("   KYC_VERIFIED group ID:", kycGroupId?.toString());

  const tx2 = await passport.createCredentialGroup("ACCREDITED_INVESTOR");
  const receipt2 = await tx2.wait();
  const accreditedGroupId = receipt2?.logs?.[0]
    ? (passport.interface.parseLog({ topics: [...receipt2.logs[0].topics], data: receipt2.logs[0].data }))?.args?.groupId
    : 1n;
  console.log("   ACCREDITED_INVESTOR group ID:", accreditedGroupId?.toString());

  const tx3 = await passport.createCredentialGroup("HK_RESIDENT");
  const receipt3 = await tx3.wait();
  const hkGroupId = receipt3?.logs?.[0]
    ? (passport.interface.parseLog({ topics: [...receipt3.logs[0].topics], data: receipt3.logs[0].data }))?.args?.groupId
    : 2n;
  console.log("   HK_RESIDENT group ID:", hkGroupId?.toString());

  // 5. Deploy GatedRWA demo (requires KYC_VERIFIED group)
  console.log("\n5. Deploying GatedRWA demo token...");
  const mintAmount = ethers.parseEther("100"); // 100 hSILVER per KYC-verified mint
  const GatedRWA = await ethers.getContractFactory("GatedRWA");
  const rwa = await GatedRWA.deploy(semaphoreAddr, kycGroupId ?? 0n, mintAmount);
  await rwa.waitForDeployment();
  const rwaAddr = await rwa.getAddress();
  console.log("   GatedRWA (hSILVER):", rwaAddr);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log(`Network:            HashKey Chain Testnet (133)`);
  console.log(`Deployer:           ${deployer.address}`);
  console.log(`SemaphoreVerifier:  ${verifierAddr}`);
  console.log(`Semaphore:          ${semaphoreAddr}`);
  console.log(`HSKPassport:        ${passportAddr}`);
  console.log(`GatedRWA (hSILVER): ${rwaAddr}`);
  console.log(`\nCredential Groups:`);
  console.log(`  KYC_VERIFIED:         ${kycGroupId}`);
  console.log(`  ACCREDITED_INVESTOR:  ${accreditedGroupId}`);
  console.log(`  HK_RESIDENT:          ${hkGroupId}`);
  console.log("=".repeat(60));

  // Save addresses to JSON for frontend
  const fs = await import("fs");
  const addresses = {
    network: "hashkey-testnet",
    chainId: 133,
    deployer: deployer.address,
    semaphoreVerifier: verifierAddr,
    semaphore: semaphoreAddr,
    hskPassport: passportAddr,
    gatedRWA: rwaAddr,
    groups: {
      KYC_VERIFIED: kycGroupId?.toString(),
      ACCREDITED_INVESTOR: accreditedGroupId?.toString(),
      HK_RESIDENT: hkGroupId?.toString(),
    },
  };
  fs.writeFileSync("deployment.json", JSON.stringify(addresses, null, 2));
  console.log("\nAddresses saved to deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
