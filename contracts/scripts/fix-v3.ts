import { ethers } from "hardhat";
import { Identity } from "@semaphore-protocol/identity";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Fixing v3 with:", deployer.address);

  const PASSPORT = "0x79A0E1160FA829595f45f0479782095ed497d5E6";
  const SEMAPHORE = "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9";
  const KYC_GROUP = 15;

  const passport = await ethers.getContractAt("HSKPassport", PASSPORT);

  // 1. Deploy DemoIssuer for group 15
  console.log("1. Deploying DemoIssuer for group 15...");
  const DemoIssuer = await ethers.getContractFactory("DemoIssuer");
  const di = await DemoIssuer.deploy(PASSPORT, KYC_GROUP);
  await di.waitForDeployment();
  const diAddr = await di.getAddress();
  console.log("   DemoIssuer:", diAddr);

  // 2. Approve delegate for group 15
  console.log("2. Approving DemoIssuer as delegate for group 15...");
  await (await passport.approveDelegate(KYC_GROUP, diAddr)).wait();
  console.log("   Approved");

  // 3. Deploy GatedRWA for group 15
  console.log("3. Deploying GatedRWA for group 15...");
  const GatedRWA = await ethers.getContractFactory("GatedRWA");
  const rwa = await GatedRWA.deploy(SEMAPHORE, KYC_GROUP, ethers.parseEther("100"));
  await rwa.waitForDeployment();
  const rwaAddr = await rwa.getAddress();
  console.log("   GatedRWA:", rwaAddr);

  // 4. Seed group with 10 test members
  console.log("4. Seeding KYC group with 10 test members...");
  const commitments: bigint[] = [];
  for (let i = 0; i < 10; i++) {
    commitments.push(new Identity(`seed-${i}-${Date.now()}`).commitment);
  }
  await (await passport.batchIssueCredentials(KYC_GROUP, commitments)).wait();
  const info = await passport.credentialGroups(KYC_GROUP);
  console.log("   Members:", info.memberCount.toString());

  console.log("\n=== FINAL V3 ADDRESSES ===");
  console.log("HSKPassport:", PASSPORT);
  console.log("DemoIssuer:", diAddr);
  console.log("GatedRWA:", rwaAddr);
  console.log("KYC Group:", KYC_GROUP);
  console.log("ACCREDITED Group: 16");
  console.log("HK_RESIDENT Group: 17");

  const fs = await import("fs");
  fs.writeFileSync("deployment-v3.json", JSON.stringify({
    semaphore: SEMAPHORE,
    credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1",
    hskPassport: PASSPORT,
    demoIssuer: diAddr,
    gatedRWA: rwaAddr,
    groups: { KYC_VERIFIED: KYC_GROUP, ACCREDITED_INVESTOR: 16, HK_RESIDENT: 17 },
  }, null, 2));
}

main().catch(console.error);
