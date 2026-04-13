// Deploy v5: HSKPassport with on-chain credential expiry + wire issuer slashing to timelock.
// Reuses existing Semaphore, CredentialRegistry, IssuerRegistry, HSKPassportTimelock.
// Redeploys HSKPassport, HashKeyDIDBridge, HashKeyKYCImporter, JurisdictionGatedPool,
// GatedRWA, KYCGatedAirdrop, KYCGatedLending, DemoIssuer — anything that depends on HSKPassport.

import { ethers, network } from "hardhat";

const EXISTING = {
  semaphore: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9",
  credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1",
  jurisdictionSetVerifier: "0x450Dbd60aC27B7bf0131c2b25451380552dd4fBb",
  issuerRegistry: "0x5BbAe6e90b82c7c51EbA9cA6D844D698dE2eb504",
  timelock: "0xb07Bc78559CbDe44c047b1dC3028d13c4f863D8A",
  mockHashKeyDID: "0x39931820e457949b724d28C585F821005fcaB409",
  mockKYCSoulbound: "0x195572EaE140f53CcBA065751C92659935D075E9",
};

const KYC_VALIDITY_SEC = 180 * 24 * 3600;           // 180 days
const ACCREDITED_VALIDITY_SEC = 365 * 24 * 3600;    // 1 year
const RESIDENT_VALIDITY_SEC = 0;                    // never expires

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Network:", network.name);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "HSK\n");

  // ---- 1. Redeploy HSKPassport ----
  console.log("[1/9] Deploying HSKPassport (with expiry)...");
  const Passport = await ethers.getContractFactory("HSKPassport");
  const passport = await Passport.deploy(EXISTING.semaphore);
  await passport.waitForDeployment();
  const passportAddr = await passport.getAddress();
  console.log("  HSKPassport:", passportAddr);

  // ---- 2. Create 5 credential groups with validity periods ----
  console.log("\n[2/9] Creating credential groups...");
  const groupConfigs = [
    { name: "KYC Verified", schema: ethers.ZeroHash, validity: KYC_VALIDITY_SEC },
    { name: "Accredited Investor", schema: ethers.ZeroHash, validity: ACCREDITED_VALIDITY_SEC },
    { name: "HK Resident", schema: ethers.ZeroHash, validity: RESIDENT_VALIDITY_SEC },
    { name: "SG Resident", schema: ethers.ZeroHash, validity: RESIDENT_VALIDITY_SEC },
    { name: "AE Resident", schema: ethers.ZeroHash, validity: RESIDENT_VALIDITY_SEC },
  ];
  const groupIds: number[] = [];
  for (const g of groupConfigs) {
    const tx = await passport.createCredentialGroup(g.name, g.schema);
    const rc = await tx.wait();
    const ev = rc!.logs.find((l: any) => (l as any).fragment?.name === "CredentialGroupCreated") as any;
    const gid = Number(ev.args.groupId);
    groupIds.push(gid);
    if (g.validity > 0) {
      const vtx = await passport.setValidityPeriod(gid, g.validity);
      await vtx.wait();
      console.log(`  ${g.name} → id=${gid} (validity ${g.validity / 86400}d)`);
    } else {
      console.log(`  ${g.name} → id=${gid} (no expiry)`);
    }
  }
  const [KYC, ACC, HK, SG, AE] = groupIds;

  // ---- 3. Wire IssuerRegistry slashing authority to timelock ----
  console.log("\n[3/9] Wiring IssuerRegistry slashing authority to Timelock...");
  const IR = await ethers.getContractAt("IssuerRegistry", EXISTING.issuerRegistry);
  const currentAuth = await IR.slashingAuthority();
  if (currentAuth.toLowerCase() !== EXISTING.timelock.toLowerCase()) {
    const tx = await IR.setSlashingAuthority(EXISTING.timelock);
    await tx.wait();
    console.log(`  slashingAuthority = ${EXISTING.timelock}`);
  } else {
    console.log("  already wired");
  }

  // ---- 4. DemoIssuer ----
  console.log("\n[4/9] Deploying DemoIssuer...");
  const Demo = await ethers.getContractFactory("DemoIssuer");
  const demo = await Demo.deploy(passportAddr, KYC);
  await demo.waitForDeployment();
  const demoAddr = await demo.getAddress();
  console.log("  DemoIssuer:", demoAddr);
  await (await passport.approveDelegate(KYC, demoAddr)).wait();
  console.log("  approved as delegate for KYC group");

  // ---- 5. GatedRWA (hSILVER) — uses Semaphore directly (legacy, pre-passport design) ----
  console.log("\n[5/9] Deploying GatedRWA (hSILVER)...");
  const RWA = await ethers.getContractFactory("GatedRWA");
  const rwa = await RWA.deploy(EXISTING.semaphore, KYC, ethers.parseEther("100"));
  await rwa.waitForDeployment();
  console.log("  GatedRWA:", await rwa.getAddress());

  // ---- 6. KYCGatedAirdrop (hPILOT) ----
  console.log("\n[6/9] Deploying KYCGatedAirdrop...");
  const Air = await ethers.getContractFactory("KYCGatedAirdrop");
  const airdrop = await Air.deploy(passportAddr, KYC, ethers.parseEther("1000"), "HashKey Pilot", "hPILOT");
  await airdrop.waitForDeployment();
  console.log("  KYCGatedAirdrop:", await airdrop.getAddress());

  // ---- 7. KYCGatedLending ----
  console.log("\n[7/9] Deploying KYCGatedLending...");
  const Lend = await ethers.getContractFactory("KYCGatedLending");
  const lend = await Lend.deploy(passportAddr, ACC);
  await lend.waitForDeployment();
  console.log("  KYCGatedLending:", await lend.getAddress());

  // ---- 8. JurisdictionGatedPool ----
  console.log("\n[8/9] Deploying JurisdictionGatedPool...");
  const Pool = await ethers.getContractFactory("JurisdictionGatedPool");
  const pool = await Pool.deploy(EXISTING.jurisdictionSetVerifier, [HK, SG, AE]);
  await pool.waitForDeployment();
  console.log("  JurisdictionGatedPool:", await pool.getAddress());

  // ---- 9. Bridges ----
  console.log("\n[9/9] Deploying HashKey bridges...");
  const DIDB = await ethers.getContractFactory("HashKeyDIDBridge");
  const didBridge = await DIDB.deploy(EXISTING.mockHashKeyDID, passportAddr, HK);
  await didBridge.waitForDeployment();
  console.log("  HashKeyDIDBridge:", await didBridge.getAddress());
  await (await passport.approveDelegate(HK, await didBridge.getAddress())).wait();

  const KYCImp = await ethers.getContractFactory("HashKeyKYCImporter");
  const kycImp = await KYCImp.deploy(EXISTING.mockKYCSoulbound, passportAddr, KYC);
  await kycImp.waitForDeployment();
  console.log("  HashKeyKYCImporter:", await kycImp.getAddress());
  await (await passport.approveDelegate(KYC, await kycImp.getAddress())).wait();

  console.log("\n=== Summary ===");
  console.log(JSON.stringify({
    hskPassport: passportAddr,
    demoIssuer: demoAddr,
    gatedRWA: await rwa.getAddress(),
    kycGatedAirdrop: await airdrop.getAddress(),
    kycGatedLending: await lend.getAddress(),
    jurisdictionGatedPool: await pool.getAddress(),
    hashKeyDIDBridge: await didBridge.getAddress(),
    hashKeyKYCImporter: await kycImp.getAddress(),
    groups: { KYC_VERIFIED: KYC, ACCREDITED_INVESTOR: ACC, HK_RESIDENT: HK, SG_RESIDENT: SG, AE_RESIDENT: AE },
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
