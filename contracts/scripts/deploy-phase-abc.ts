import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Phase A+B+C with:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "HSK\n");

  // Existing addresses (v3 deployment)
  const HSK_PASSPORT = "0x79A0E1160FA829595f45f0479782095ed497d5E6";
  const KYC_GROUP = 15;
  const ACCREDITED_GROUP = 16;
  const HK_RESIDENT_GROUP = 17;

  const deployed: Record<string, string> = {};

  // ============================================================
  // Phase A.1 — CredentialExpiry
  // ============================================================
  console.log("A.1 Deploying CredentialExpiry...");
  const CredentialExpiry = await ethers.getContractFactory("CredentialExpiry");
  const expiry = await CredentialExpiry.deploy(HSK_PASSPORT);
  await expiry.waitForDeployment();
  deployed.credentialExpiry = await expiry.getAddress();
  console.log("   CredentialExpiry:", deployed.credentialExpiry);

  // Configure validity periods (demo: 1 year for KYC, 6 months for accredited, 2 years for HK resident)
  await (await expiry.setValidityPeriod(KYC_GROUP, 365 * 24 * 60 * 60)).wait();
  await (await expiry.setValidityPeriod(ACCREDITED_GROUP, 180 * 24 * 60 * 60)).wait();
  await (await expiry.setValidityPeriod(HK_RESIDENT_GROUP, 730 * 24 * 60 * 60)).wait();
  console.log("   Validity periods set: KYC=1y, Accredited=6mo, HKResident=2y");

  // ============================================================
  // Phase A.2 — CredentialReputation
  // ============================================================
  console.log("\nA.2 Deploying CredentialReputation...");
  const CredentialReputation = await ethers.getContractFactory("CredentialReputation");
  const reputation = await CredentialReputation.deploy(HSK_PASSPORT);
  await reputation.waitForDeployment();
  deployed.credentialReputation = await reputation.getAddress();
  console.log("   CredentialReputation:", deployed.credentialReputation);

  // Configure points: KYC=10, Accredited=50, HKResident=20
  await (await reputation.setPointsPerGroup(KYC_GROUP, 10)).wait();
  await (await reputation.setPointsPerGroup(ACCREDITED_GROUP, 50)).wait();
  await (await reputation.setPointsPerGroup(HK_RESIDENT_GROUP, 20)).wait();
  console.log("   Points per group: KYC=10, Accredited=50, HKResident=20");

  // ============================================================
  // Phase A.3 — JurisdictionGatedPool (uses JurisdictionSetVerifier library)
  // ============================================================
  console.log("\nA.3 Deploying JurisdictionGatedPool ([HK, SG, AE])...");
  // Need 3 groups. Currently only HK_RESIDENT (17) exists. Let's create 2 more.
  const passport = await ethers.getContractAt("HSKPassport", HSK_PASSPORT);

  console.log("   Creating SG_RESIDENT group...");
  const sgTx = await passport.createCredentialGroup("SG_RESIDENT", ethers.ZeroHash);
  await sgTx.wait();
  const sgGroup = Number((await passport.getGroupIds()).slice(-1)[0]);
  console.log("   SG_RESIDENT group id:", sgGroup);

  console.log("   Creating AE_RESIDENT group...");
  const aeTx = await passport.createCredentialGroup("AE_RESIDENT", ethers.ZeroHash);
  await aeTx.wait();
  const aeGroup = Number((await passport.getGroupIds()).slice(-1)[0]);
  console.log("   AE_RESIDENT group id:", aeGroup);

  // Deploy library first
  const JSV = await ethers.getContractFactory("JurisdictionSetVerifier");
  const jsv = await JSV.deploy();
  await jsv.waitForDeployment();
  const jsvAddr = await jsv.getAddress();
  deployed.jurisdictionSetVerifier = jsvAddr;
  console.log("   JurisdictionSetVerifier library:", jsvAddr);

  const JurisdictionGatedPool = await ethers.getContractFactory("JurisdictionGatedPool", {
    libraries: { "contracts/JurisdictionSetVerifier.sol:JurisdictionSetVerifier": jsvAddr },
  });
  const pool = await JurisdictionGatedPool.deploy(
    HSK_PASSPORT,
    [HK_RESIDENT_GROUP, sgGroup, aeGroup],
    "Multi-Jurisdiction Pool (HK/SG/AE)"
  );
  await pool.waitForDeployment();
  deployed.jurisdictionGatedPool = await pool.getAddress();
  console.log("   JurisdictionGatedPool:", deployed.jurisdictionGatedPool);

  // ============================================================
  // Phase B.1 — MockHashKeyDID + HashKeyDIDBridge
  // ============================================================
  console.log("\nB.1 Deploying MockHashKeyDID...");
  const MockHashKeyDID = await ethers.getContractFactory("MockHashKeyDID");
  const mockDid = await MockHashKeyDID.deploy();
  await mockDid.waitForDeployment();
  deployed.mockHashKeyDID = await mockDid.getAddress();
  console.log("   MockHashKeyDID:", deployed.mockHashKeyDID);

  console.log("   Deploying HashKeyDIDBridge (maps DIDs → HK_RESIDENT group)...");
  const Bridge = await ethers.getContractFactory("HashKeyDIDBridge");
  const bridge = await Bridge.deploy(HSK_PASSPORT, HK_RESIDENT_GROUP);
  await bridge.waitForDeployment();
  deployed.hashKeyDIDBridge = await bridge.getAddress();
  console.log("   HashKeyDIDBridge:", deployed.hashKeyDIDBridge);

  // Wire up MockHashKeyDID
  await (await bridge.setHashKeyDID(deployed.mockHashKeyDID)).wait();
  console.log("   Bridge configured with MockHashKeyDID");

  // Approve bridge as delegate for HK_RESIDENT group
  await (await passport.approveDelegate(HK_RESIDENT_GROUP, deployed.hashKeyDIDBridge)).wait();
  console.log("   Bridge approved as delegate for HK_RESIDENT group");

  // ============================================================
  // Phase B.3 — MockKYCSoulbound + HashKeyKYCImporter
  // ============================================================
  console.log("\nB.3 Deploying MockKYCSoulbound...");
  const MockKYC = await ethers.getContractFactory("MockKYCSoulbound");
  const mockKyc = await MockKYC.deploy();
  await mockKyc.waitForDeployment();
  deployed.mockKYCSoulbound = await mockKyc.getAddress();
  console.log("   MockKYCSoulbound:", deployed.mockKYCSoulbound);

  console.log("   Deploying HashKeyKYCImporter...");
  const Importer = await ethers.getContractFactory("HashKeyKYCImporter");
  const importer = await Importer.deploy(HSK_PASSPORT, KYC_GROUP, ACCREDITED_GROUP, HK_RESIDENT_GROUP);
  await importer.waitForDeployment();
  deployed.hashKeyKYCImporter = await importer.getAddress();
  console.log("   HashKeyKYCImporter:", deployed.hashKeyKYCImporter);

  await (await importer.setKYCSbt(deployed.mockKYCSoulbound)).wait();
  console.log("   Importer configured with MockKYCSoulbound");

  // Approve importer as delegate for KYC groups
  await (await passport.approveDelegate(KYC_GROUP, deployed.hashKeyKYCImporter)).wait();
  await (await passport.approveDelegate(ACCREDITED_GROUP, deployed.hashKeyKYCImporter)).wait();
  console.log("   Importer approved as delegate for KYC + Accredited groups");

  // ============================================================
  // Phase C.2 — IssuerRegistry
  // ============================================================
  console.log("\nC.2 Deploying IssuerRegistry...");
  const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
  const registry = await IssuerRegistry.deploy();
  await registry.waitForDeployment();
  deployed.issuerRegistry = await registry.getAddress();
  console.log("   IssuerRegistry:", deployed.issuerRegistry);

  // ============================================================
  // Phase C.3 — Timelock (with deployer as sole proposer/executor for now; transfer to Safe later)
  // ============================================================
  console.log("\nC.3 Deploying HSKPassportTimelock...");
  const Timelock = await ethers.getContractFactory("HSKPassportTimelock");
  const timelock = await Timelock.deploy(
    [deployer.address], // proposers (will add Safe later)
    [ethers.ZeroAddress], // executors (anyone can execute)
    deployer.address // admin (transferred to Safe later)
  );
  await timelock.waitForDeployment();
  deployed.timelock = await timelock.getAddress();
  console.log("   HSKPassportTimelock:", deployed.timelock);

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("PHASE A+B+C DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  Object.entries(deployed).forEach(([k, v]) => console.log(`${k}: ${v}`));
  console.log("\nNew groups:");
  console.log(`  HK_RESIDENT: ${HK_RESIDENT_GROUP}`);
  console.log(`  SG_RESIDENT: ${sgGroup}`);
  console.log(`  AE_RESIDENT: ${aeGroup}`);

  const fs = await import("fs");
  fs.writeFileSync("deployment-phase-abc.json", JSON.stringify({
    ...deployed,
    groups: { HK_RESIDENT: HK_RESIDENT_GROUP, SG_RESIDENT: sgGroup, AE_RESIDENT: aeGroup },
  }, null, 2));
  console.log("\nSaved to deployment-phase-abc.json");
}

main().catch(console.error);
