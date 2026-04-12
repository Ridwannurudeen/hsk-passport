import { ethers } from "hardhat";
import { Identity } from "@semaphore-protocol/identity";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying v4 (post-audit fixes) with:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "HSK\n");

  // Reuse Semaphore + CredentialRegistry (unaffected by audit fixes)
  const SEMAPHORE = "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9";
  const CREDENTIAL_REGISTRY = "0x20265dAe4711B3CeF88D7078bf1290f815279De1";

  // 1. Deploy HSKPassport v4 (with offboarding + delegate split fixes)
  console.log("1. Deploying HSKPassport v4...");
  const HSKPassport = await ethers.getContractFactory("HSKPassport");
  const passport = await HSKPassport.deploy(SEMAPHORE);
  await passport.waitForDeployment();
  const passportAddr = await passport.getAddress();
  console.log("   HSKPassport v4:", passportAddr);

  // 2. Create groups
  console.log("\n2. Creating groups...");
  const ZERO = ethers.ZeroHash;
  await (await passport.createCredentialGroup("KYC_VERIFIED", ZERO)).wait();
  await (await passport.createCredentialGroup("ACCREDITED_INVESTOR", ZERO)).wait();
  await (await passport.createCredentialGroup("HK_RESIDENT", ZERO)).wait();
  await (await passport.createCredentialGroup("SG_RESIDENT", ZERO)).wait();
  await (await passport.createCredentialGroup("AE_RESIDENT", ZERO)).wait();
  const ids = await passport.getGroupIds();
  const kyc = Number(ids[0]);
  const accredited = Number(ids[1]);
  const hk = Number(ids[2]);
  const sg = Number(ids[3]);
  const ae = Number(ids[4]);
  console.log(`   groups: KYC=${kyc} ACCR=${accredited} HK=${hk} SG=${sg} AE=${ae}`);

  // 3. DemoIssuer
  console.log("\n3. Deploying DemoIssuer...");
  const DemoIssuer = await ethers.getContractFactory("DemoIssuer");
  const demoIssuer = await DemoIssuer.deploy(passportAddr, kyc);
  await demoIssuer.waitForDeployment();
  const demoIssuerAddr = await demoIssuer.getAddress();
  console.log("   DemoIssuer:", demoIssuerAddr);
  await (await passport.approveDelegate(kyc, demoIssuerAddr)).wait();

  // 4. Mock HashKey DID + Bridge
  console.log("\n4. Deploying MockHashKeyDID + HashKeyDIDBridge v2...");
  const MockDID = await ethers.getContractFactory("MockHashKeyDID");
  const mockDid = await MockDID.deploy();
  await mockDid.waitForDeployment();
  const mockDidAddr = await mockDid.getAddress();

  const Bridge = await ethers.getContractFactory("HashKeyDIDBridge");
  const bridge = await Bridge.deploy(passportAddr, hk);
  await bridge.waitForDeployment();
  const bridgeAddr = await bridge.getAddress();
  await (await bridge.setHashKeyDID(mockDidAddr)).wait();
  await (await passport.approveDelegate(hk, bridgeAddr)).wait();
  console.log("   MockHashKeyDID:", mockDidAddr);
  console.log("   HashKeyDIDBridge v2:", bridgeAddr);

  // 5. Mock KYC SBT + Importer
  console.log("\n5. Deploying MockKYCSoulbound + HashKeyKYCImporter v2...");
  const MockKYC = await ethers.getContractFactory("MockKYCSoulbound");
  const mockKyc = await MockKYC.deploy();
  await mockKyc.waitForDeployment();
  const mockKycAddr = await mockKyc.getAddress();

  const Importer = await ethers.getContractFactory("HashKeyKYCImporter");
  const importer = await Importer.deploy(passportAddr, kyc, accredited, hk);
  await importer.waitForDeployment();
  const importerAddr = await importer.getAddress();
  await (await importer.setKYCSbt(mockKycAddr)).wait();
  await (await passport.approveDelegate(kyc, importerAddr)).wait();
  await (await passport.approveDelegate(accredited, importerAddr)).wait();
  console.log("   MockKYCSoulbound:", mockKycAddr);
  console.log("   HashKeyKYCImporter v2:", importerAddr);

  // 6. GatedRWA
  console.log("\n6. Deploying GatedRWA (hSILVER)...");
  const GatedRWA = await ethers.getContractFactory("GatedRWA");
  const rwa = await GatedRWA.deploy(SEMAPHORE, kyc, ethers.parseEther("100"));
  await rwa.waitForDeployment();
  const rwaAddr = await rwa.getAddress();
  console.log("   GatedRWA:", rwaAddr);

  // 7. KYCGatedAirdrop
  console.log("\n7. Deploying KYCGatedAirdrop (hPILOT)...");
  const Airdrop = await ethers.getContractFactory("KYCGatedAirdrop");
  const airdrop = await Airdrop.deploy(
    passportAddr, kyc, ethers.parseEther("50"), "HashKey Pilot Airdrop", "hPILOT"
  );
  await airdrop.waitForDeployment();
  const airdropAddr = await airdrop.getAddress();
  console.log("   KYCGatedAirdrop:", airdropAddr);

  // 8. KYCGatedLending
  console.log("\n8. Deploying KYCGatedLending...");
  const Lending = await ethers.getContractFactory("KYCGatedLending");
  const lending = await Lending.deploy(passportAddr, accredited);
  await lending.waitForDeployment();
  const lendingAddr = await lending.getAddress();
  // Seed small liquidity
  await (await lending.deposit({ value: ethers.parseEther("0.005") })).wait();
  console.log("   KYCGatedLending:", lendingAddr);

  // 9. JurisdictionGatedPool
  console.log("\n9. Deploying JurisdictionSetVerifier + JurisdictionGatedPool...");
  const JSV = await ethers.getContractFactory("JurisdictionSetVerifier");
  const jsv = await JSV.deploy();
  await jsv.waitForDeployment();
  const jsvAddr = await jsv.getAddress();

  const Pool = await ethers.getContractFactory("JurisdictionGatedPool", {
    libraries: { "contracts/JurisdictionSetVerifier.sol:JurisdictionSetVerifier": jsvAddr },
  });
  const pool = await Pool.deploy(passportAddr, [hk, sg, ae], "Multi-Jurisdiction Pool (HK/SG/AE)");
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("   JurisdictionSetVerifier:", jsvAddr);
  console.log("   JurisdictionGatedPool:", poolAddr);

  // 10. Roadmap/scaffolding (deployed but clearly labeled as not production)
  console.log("\n10. Deploying roadmap scaffolding (CredentialExpiry, Reputation, IssuerRegistry)...");
  const Expiry = await ethers.getContractFactory("CredentialExpiry");
  const expiry = await Expiry.deploy(passportAddr);
  await expiry.waitForDeployment();

  const Reputation = await ethers.getContractFactory("CredentialReputation");
  const reputation = await Reputation.deploy(passportAddr);
  await reputation.waitForDeployment();

  const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
  const registry = await IssuerRegistry.deploy();
  await registry.waitForDeployment();

  const Timelock = await ethers.getContractFactory("HSKPassportTimelock");
  const timelock = await Timelock.deploy([deployer.address], [ethers.ZeroAddress], deployer.address);
  await timelock.waitForDeployment();

  console.log("   CredentialExpiry:", await expiry.getAddress());
  console.log("   CredentialReputation:", await reputation.getAddress());
  console.log("   IssuerRegistry:", await registry.getAddress());
  console.log("   HSKPassportTimelock:", await timelock.getAddress());

  // 11. Seed KYC group with test members for meaningful anonymity set
  console.log("\n11. Seeding KYC group with 10 test members...");
  const seedCommitments: bigint[] = [];
  for (let i = 0; i < 10; i++) {
    seedCommitments.push(new Identity(`v4-seed-${i}-${Date.now()}`).commitment);
  }
  await (await passport.batchIssueCredentials(kyc, seedCommitments)).wait();
  console.log("   Seeded 10 members");

  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("V4 DEPLOYMENT COMPLETE (POST-AUDIT)");
  console.log("=".repeat(60));

  const final = {
    semaphore: SEMAPHORE,
    credentialRegistry: CREDENTIAL_REGISTRY,
    hskPassport: passportAddr,
    demoIssuer: demoIssuerAddr,
    gatedRWA: rwaAddr,
    kycGatedAirdrop: airdropAddr,
    kycGatedLending: lendingAddr,
    jurisdictionSetVerifier: jsvAddr,
    jurisdictionGatedPool: poolAddr,
    mockHashKeyDID: mockDidAddr,
    hashKeyDIDBridge: bridgeAddr,
    mockKYCSoulbound: mockKycAddr,
    hashKeyKYCImporter: importerAddr,
    credentialExpiry: await expiry.getAddress(),
    credentialReputation: await reputation.getAddress(),
    issuerRegistry: await registry.getAddress(),
    timelock: await timelock.getAddress(),
    groups: { KYC_VERIFIED: kyc, ACCREDITED_INVESTOR: accredited, HK_RESIDENT: hk, SG_RESIDENT: sg, AE_RESIDENT: ae },
  };
  Object.entries(final).forEach(([k, v]) => {
    if (typeof v === "string") console.log(`  ${k}: ${v}`);
  });
  console.log(`  groups:`, final.groups);

  const fs = await import("fs");
  fs.writeFileSync("deployment-v4.json", JSON.stringify(final, null, 2));
  console.log("\nSaved to deployment-v4.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
