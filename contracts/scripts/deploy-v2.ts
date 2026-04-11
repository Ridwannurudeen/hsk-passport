import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying v2 with:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "HSK\n");

  // Reuse existing Semaphore infrastructure
  const SEMAPHORE_VERIFIER = "0xe874E5DE61fa40dAf82e8916489d1B7071aC3b9A";
  const POSEIDON_T3 = "0x3B574ED5c34F8CE27E1D6960b69dec3003071301";
  const SEMAPHORE = "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9";

  // 1. Deploy CredentialRegistry
  console.log("1. Deploying CredentialRegistry...");
  const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
  const registry = await CredentialRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("   CredentialRegistry:", registryAddr);

  // 2. Deploy upgraded HSKPassport v2
  console.log("\n2. Deploying HSKPassport v2...");
  const HSKPassport = await ethers.getContractFactory("HSKPassport");
  const passport = await HSKPassport.deploy(SEMAPHORE);
  await passport.waitForDeployment();
  const passportAddr = await passport.getAddress();
  console.log("   HSKPassport v2:", passportAddr);

  // 3. Register credential schemas
  console.log("\n3. Registering credential schemas...");
  const kycSchemaHash = ethers.keccak256(ethers.toUtf8Bytes('{"type":"KYCVerified","version":"1.0","issuer":"HashKey"}'));
  const accreditedSchemaHash = ethers.keccak256(ethers.toUtf8Bytes('{"type":"AccreditedInvestor","version":"1.0","issuer":"HashKey"}'));
  const hkResidentSchemaHash = ethers.keccak256(ethers.toUtf8Bytes('{"type":"HKResident","version":"1.0","issuer":"HashKey"}'));

  await (await registry.registerSchema(kycSchemaHash, "https://hskpassport.gudman.xyz/schemas/kyc-verified.json", true)).wait();
  console.log("   KYCVerified schema:", kycSchemaHash);
  await (await registry.registerSchema(accreditedSchemaHash, "https://hskpassport.gudman.xyz/schemas/accredited-investor.json", true)).wait();
  console.log("   AccreditedInvestor schema:", accreditedSchemaHash);
  await (await registry.registerSchema(hkResidentSchemaHash, "https://hskpassport.gudman.xyz/schemas/hk-resident.json", true)).wait();
  console.log("   HKResident schema:", hkResidentSchemaHash);

  // 4. Create credential groups linked to schemas
  console.log("\n4. Creating credential groups...");
  await (await passport.createCredentialGroup("KYC_VERIFIED")).wait();
  console.log("   KYC_VERIFIED (group 0)");
  await (await passport.createCredentialGroup("ACCREDITED_INVESTOR")).wait();
  console.log("   ACCREDITED_INVESTOR (group 1)");
  await (await passport.createCredentialGroup("HK_RESIDENT")).wait();
  console.log("   HK_RESIDENT (group 2)");

  // 5. Deploy DemoIssuer
  console.log("\n5. Deploying DemoIssuer...");
  const DemoIssuer = await ethers.getContractFactory("DemoIssuer");
  const demoIssuer = await DemoIssuer.deploy(passportAddr, 0); // group 0 = KYC_VERIFIED
  await demoIssuer.waitForDeployment();
  const demoIssuerAddr = await demoIssuer.getAddress();
  console.log("   DemoIssuer:", demoIssuerAddr);

  // 6. Approve DemoIssuer as a delegate
  console.log("\n6. Approving DemoIssuer as delegate...");
  await (await passport.approveDelegate(demoIssuerAddr)).wait();
  console.log("   DemoIssuer approved as delegate");

  // 7. Deploy GatedRWA demo token
  console.log("\n7. Deploying GatedRWA (hSILVER)...");
  const mintAmount = ethers.parseEther("100");
  const GatedRWA = await ethers.getContractFactory("GatedRWA");
  const rwa = await GatedRWA.deploy(SEMAPHORE, 0, mintAmount);
  await rwa.waitForDeployment();
  const rwaAddr = await rwa.getAddress();
  console.log("   GatedRWA (hSILVER):", rwaAddr);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT V2 COMPLETE");
  console.log("=".repeat(60));
  console.log(`Network:             HashKey Chain Testnet (133)`);
  console.log(`Deployer:            ${deployer.address}`);
  console.log(`SemaphoreVerifier:   ${SEMAPHORE_VERIFIER} (reused)`);
  console.log(`PoseidonT3:          ${POSEIDON_T3} (reused)`);
  console.log(`Semaphore:           ${SEMAPHORE} (reused)`);
  console.log(`CredentialRegistry:  ${registryAddr}`);
  console.log(`HSKPassport v2:      ${passportAddr}`);
  console.log(`DemoIssuer:          ${demoIssuerAddr}`);
  console.log(`GatedRWA (hSILVER):  ${rwaAddr}`);
  console.log("=".repeat(60));

  // Save addresses
  const fs = await import("fs");
  const addresses = {
    network: "hashkey-testnet",
    chainId: 133,
    version: 2,
    deployer: deployer.address,
    semaphoreVerifier: SEMAPHORE_VERIFIER,
    poseidonT3: POSEIDON_T3,
    semaphore: SEMAPHORE,
    credentialRegistry: registryAddr,
    hskPassport: passportAddr,
    demoIssuer: demoIssuerAddr,
    gatedRWA: rwaAddr,
    schemas: {
      KYCVerified: kycSchemaHash,
      AccreditedInvestor: accreditedSchemaHash,
      HKResident: hkResidentSchemaHash,
    },
    groups: { KYC_VERIFIED: "0", ACCREDITED_INVESTOR: "1", HK_RESIDENT: "2" },
  };
  fs.writeFileSync("deployment-v2.json", JSON.stringify(addresses, null, 2));
  console.log("\nAddresses saved to deployment-v2.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
