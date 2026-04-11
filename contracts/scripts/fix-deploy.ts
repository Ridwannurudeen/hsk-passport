import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Fixing deploy with:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "HSK\n");

  const PASSPORT = "0x728bB8D8269a826b54a45385cF87ebDD785Ed1D6";
  const SEMAPHORE = "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9";
  const KYC_GROUP = 3; // Correct group with active=true

  // 1. Deploy new DemoIssuer pointing to group 3
  console.log("1. Deploying DemoIssuer (group 3)...");
  const DemoIssuer = await ethers.getContractFactory("DemoIssuer");
  const demoIssuer = await DemoIssuer.deploy(PASSPORT, KYC_GROUP);
  await demoIssuer.waitForDeployment();
  const diAddr = await demoIssuer.getAddress();
  console.log("   DemoIssuer:", diAddr);

  // 2. Approve as delegate
  console.log("\n2. Approving DemoIssuer as delegate...");
  const passport = await ethers.getContractAt("HSKPassport", PASSPORT);
  await (await passport.approveDelegate(diAddr)).wait();
  console.log("   Approved");

  // 3. Deploy new GatedRWA pointing to group 3
  console.log("\n3. Deploying GatedRWA (group 3)...");
  const GatedRWA = await ethers.getContractFactory("GatedRWA");
  const rwa = await GatedRWA.deploy(SEMAPHORE, KYC_GROUP, ethers.parseEther("100"));
  await rwa.waitForDeployment();
  const rwaAddr = await rwa.getAddress();
  console.log("   GatedRWA:", rwaAddr);

  // 4. Verify group 3 state
  console.log("\n4. Verifying group 3...");
  const g = await passport.credentialGroups(KYC_GROUP);
  console.log("   Name:", g.name, "Active:", g.active, "Issuer:", g.issuer);

  console.log("\n=== CORRECTED ADDRESSES ===");
  console.log("HSKPassport:    ", PASSPORT);
  console.log("DemoIssuer:     ", diAddr);
  console.log("GatedRWA:       ", rwaAddr);
  console.log("KYC Group ID:    3");
  console.log("ACCREDITED ID:   4");
  console.log("HK_RESIDENT ID:  5");

  // Save
  const fs = await import("fs");
  fs.writeFileSync("deployment-v2-fixed.json", JSON.stringify({
    semaphore: SEMAPHORE,
    credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1",
    hskPassport: PASSPORT,
    demoIssuer: diAddr,
    gatedRWA: rwaAddr,
    groups: { KYC_VERIFIED: 3, ACCREDITED_INVESTOR: 4, HK_RESIDENT: 5 },
  }, null, 2));
}

main().catch(console.error);
