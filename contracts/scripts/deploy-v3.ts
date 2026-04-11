import { ethers } from "hardhat";
import { Identity } from "@semaphore-protocol/identity";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying v3 (security fixes) with:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "HSK\n");

  const SEMAPHORE = "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9";

  // 1. Deploy fixed HSKPassport v3
  console.log("1. Deploying HSKPassport v3 (per-group delegates)...");
  const HSKPassport = await ethers.getContractFactory("HSKPassport");
  const passport = await HSKPassport.deploy(SEMAPHORE);
  await passport.waitForDeployment();
  const passportAddr = await passport.getAddress();
  console.log("   HSKPassport:", passportAddr);

  // 2. Create groups and capture actual IDs
  console.log("\n2. Creating groups...");
  const ZERO_SCHEMA = ethers.ZeroHash;
  await (await passport.createCredentialGroup("KYC_VERIFIED", ZERO_SCHEMA)).wait();
  await (await passport.createCredentialGroup("ACCREDITED_INVESTOR", ZERO_SCHEMA)).wait();
  await (await passport.createCredentialGroup("HK_RESIDENT", ZERO_SCHEMA)).wait();

  const ids = await passport.getGroupIds();
  const kycGroup = Number(ids[0]);
  const accreditedGroup = Number(ids[1]);
  const hkGroup = Number(ids[2]);
  console.log(`   KYC_VERIFIED: ${kycGroup}, ACCREDITED_INVESTOR: ${accreditedGroup}, HK_RESIDENT: ${hkGroup}`);

  // 3. Deploy DemoIssuer
  console.log("\n3. Deploying DemoIssuer...");
  const DemoIssuer = await ethers.getContractFactory("DemoIssuer");
  const demoIssuer = await DemoIssuer.deploy(passportAddr, kycGroup);
  await demoIssuer.waitForDeployment();
  const diAddr = await demoIssuer.getAddress();
  console.log("   DemoIssuer:", diAddr);

  // 4. Approve DemoIssuer as delegate for KYC group
  console.log("\n4. Approving DemoIssuer as delegate for group 0...");
  await (await passport.approveDelegate(kycGroup, diAddr)).wait();
  console.log("   Approved");

  // 5. Deploy fixed GatedRWA (caller-bound proofs)
  console.log("\n5. Deploying GatedRWA v2 (caller-bound proofs)...");
  const GatedRWA = await ethers.getContractFactory("GatedRWA");
  const rwa = await GatedRWA.deploy(SEMAPHORE, kycGroup, ethers.parseEther("100"));
  await rwa.waitForDeployment();
  const rwaAddr = await rwa.getAddress();
  console.log("   GatedRWA:", rwaAddr);

  // 6. Seed group with 10 test identities for meaningful anonymity set
  console.log("\n6. Seeding KYC group with 10 test members...");
  const seedCommitments: bigint[] = [];
  for (let i = 0; i < 10; i++) {
    const id = new Identity(`seed-member-${i}-${Date.now()}`);
    seedCommitments.push(id.commitment);
  }
  await (await passport.batchIssueCredentials(kycGroup, seedCommitments)).wait();
  console.log("   Seeded 10 members");

  // Verify
  const groupInfo = await passport.credentialGroups(kycGroup);
  console.log("   Group members:", groupInfo.memberCount.toString());

  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT V3 COMPLETE (SECURITY FIXES)");
  console.log("=".repeat(60));
  console.log(`Semaphore:        ${SEMAPHORE} (reused)`);
  console.log(`HSKPassport v3:   ${passportAddr}`);
  console.log(`DemoIssuer:       ${diAddr}`);
  console.log(`GatedRWA v2:      ${rwaAddr}`);
  console.log(`KYC Group:        0 (seeded with 10 members)`);
  console.log("=".repeat(60));

  const fs = await import("fs");
  fs.writeFileSync("deployment-v3.json", JSON.stringify({
    semaphore: SEMAPHORE,
    credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1",
    hskPassport: passportAddr,
    demoIssuer: diAddr,
    gatedRWA: rwaAddr,
    groups: { KYC_VERIFIED: kycGroup, ACCREDITED_INVESTOR: accreditedGroup, HK_RESIDENT: hkGroup },
  }, null, 2));
  console.log("\nSaved to deployment-v3.json");
}

main().catch(console.error);
