import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying remaining contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "HSK\n");

  const HSK_PASSPORT = "0x79A0E1160FA829595f45f0479782095ed497d5E6";
  const KYC_GROUP = 15;
  const ACCREDITED_GROUP = 16;
  const HK_RESIDENT_GROUP = 17;
  const SG_GROUP = 18; // created in previous run
  const AE_GROUP = 19; // created in previous run

  const deployed: Record<string, string> = {
    credentialExpiry: "0x11fF27Bf3F0Bbf45a5dC43210359c56E45E97770",
    credentialReputation: "0x39cc2a483Cc22Cf7B461759404642Fa528df96D7",
  };

  const passport = await ethers.getContractAt("HSKPassport", HSK_PASSPORT);

  // JurisdictionSetVerifier library
  console.log("Deploying JurisdictionSetVerifier library...");
  const JSV = await ethers.getContractFactory("JurisdictionSetVerifier");
  const jsv = await JSV.deploy();
  await jsv.waitForDeployment();
  deployed.jurisdictionSetVerifier = await jsv.getAddress();
  console.log("   lib:", deployed.jurisdictionSetVerifier);

  // JurisdictionGatedPool
  console.log("Deploying JurisdictionGatedPool...");
  const Pool = await ethers.getContractFactory("JurisdictionGatedPool", {
    libraries: { "contracts/JurisdictionSetVerifier.sol:JurisdictionSetVerifier": deployed.jurisdictionSetVerifier },
  });
  const pool = await Pool.deploy(HSK_PASSPORT, [HK_RESIDENT_GROUP, SG_GROUP, AE_GROUP], "Multi-Jurisdiction Pool (HK/SG/AE)");
  await pool.waitForDeployment();
  deployed.jurisdictionGatedPool = await pool.getAddress();
  console.log("   pool:", deployed.jurisdictionGatedPool);

  // MockHashKeyDID
  console.log("Deploying MockHashKeyDID...");
  const MockDid = await ethers.getContractFactory("MockHashKeyDID");
  const mockDid = await MockDid.deploy();
  await mockDid.waitForDeployment();
  deployed.mockHashKeyDID = await mockDid.getAddress();
  console.log("   ", deployed.mockHashKeyDID);

  // HashKeyDIDBridge
  console.log("Deploying HashKeyDIDBridge...");
  const Bridge = await ethers.getContractFactory("HashKeyDIDBridge");
  const bridge = await Bridge.deploy(HSK_PASSPORT, HK_RESIDENT_GROUP);
  await bridge.waitForDeployment();
  deployed.hashKeyDIDBridge = await bridge.getAddress();
  console.log("   ", deployed.hashKeyDIDBridge);

  await (await bridge.setHashKeyDID(deployed.mockHashKeyDID)).wait();
  await (await passport.approveDelegate(HK_RESIDENT_GROUP, deployed.hashKeyDIDBridge)).wait();
  console.log("   configured + approved as delegate");

  // MockKYCSoulbound
  console.log("Deploying MockKYCSoulbound...");
  const MockKYC = await ethers.getContractFactory("MockKYCSoulbound");
  const mockKyc = await MockKYC.deploy();
  await mockKyc.waitForDeployment();
  deployed.mockKYCSoulbound = await mockKyc.getAddress();
  console.log("   ", deployed.mockKYCSoulbound);

  // HashKeyKYCImporter
  console.log("Deploying HashKeyKYCImporter...");
  const Importer = await ethers.getContractFactory("HashKeyKYCImporter");
  const importer = await Importer.deploy(HSK_PASSPORT, KYC_GROUP, ACCREDITED_GROUP, HK_RESIDENT_GROUP);
  await importer.waitForDeployment();
  deployed.hashKeyKYCImporter = await importer.getAddress();
  console.log("   ", deployed.hashKeyKYCImporter);

  await (await importer.setKYCSbt(deployed.mockKYCSoulbound)).wait();
  await (await passport.approveDelegate(KYC_GROUP, deployed.hashKeyKYCImporter)).wait();
  await (await passport.approveDelegate(ACCREDITED_GROUP, deployed.hashKeyKYCImporter)).wait();
  console.log("   configured + approved as delegate");

  // IssuerRegistry
  console.log("Deploying IssuerRegistry...");
  const IR = await ethers.getContractFactory("IssuerRegistry");
  const ir = await IR.deploy();
  await ir.waitForDeployment();
  deployed.issuerRegistry = await ir.getAddress();
  console.log("   ", deployed.issuerRegistry);

  // Timelock
  console.log("Deploying HSKPassportTimelock...");
  const Timelock = await ethers.getContractFactory("HSKPassportTimelock");
  const timelock = await Timelock.deploy([deployer.address], [ethers.ZeroAddress], deployer.address);
  await timelock.waitForDeployment();
  deployed.timelock = await timelock.getAddress();
  console.log("   ", deployed.timelock);

  console.log("\n=== ALL PHASE A+B+C DEPLOYED ===");
  Object.entries(deployed).forEach(([k, v]) => console.log(`${k}: ${v}`));

  const fs = await import("fs");
  fs.writeFileSync("deployment-phase-abc.json", JSON.stringify({
    ...deployed,
    groups: { KYC_VERIFIED: KYC_GROUP, ACCREDITED_INVESTOR: ACCREDITED_GROUP, HK_RESIDENT: HK_RESIDENT_GROUP, SG_RESIDENT: SG_GROUP, AE_RESIDENT: AE_GROUP },
  }, null, 2));
}

main().catch(console.error);
