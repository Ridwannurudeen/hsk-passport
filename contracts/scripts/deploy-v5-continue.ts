import { ethers } from "hardhat";

const V5 = {
  semaphore: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9",
  jurisdictionSetVerifier: "0x450Dbd60aC27B7bf0131c2b25451380552dd4fBb",
  mockHashKeyDID: "0x39931820e457949b724d28C585F821005fcaB409",
  mockKYCSoulbound: "0x195572EaE140f53CcBA065751C92659935D075E9",
  hskPassport: "0x7d2E692A08f2fb0724238396e0436106b4FbD792",
  demoIssuer: "0xBf7d566B8077A098F6844fb6b827D2A4118C88C3",
  groups: { KYC: 25, ACC: 26, HK: 27, SG: 28, AE: 29 },
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address, "balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const passport = await ethers.getContractAt("HSKPassport", V5.hskPassport);

  console.log("\n[GatedRWA]");
  const RWA = await ethers.getContractFactory("GatedRWA");
  const rwa = await RWA.deploy(V5.semaphore, V5.groups.KYC, ethers.parseEther("100"));
  await rwa.waitForDeployment();
  const rwaAddr = await rwa.getAddress();
  console.log("  ", rwaAddr);

  console.log("\n[KYCGatedAirdrop]");
  const Air = await ethers.getContractFactory("KYCGatedAirdrop");
  const airdrop = await Air.deploy(V5.hskPassport, V5.groups.KYC, ethers.parseEther("1000"), "HashKey Pilot", "hPILOT");
  await airdrop.waitForDeployment();
  const airAddr = await airdrop.getAddress();
  console.log("  ", airAddr);

  console.log("\n[KYCGatedLending]");
  const Lend = await ethers.getContractFactory("KYCGatedLending");
  const lend = await Lend.deploy(V5.hskPassport, V5.groups.ACC);
  await lend.waitForDeployment();
  const lendAddr = await lend.getAddress();
  console.log("  ", lendAddr);

  console.log("\n[JurisdictionGatedPool]");
  const Pool = await ethers.getContractFactory("JurisdictionGatedPool");
  const pool = await Pool.deploy(V5.hskPassport, [V5.groups.HK, V5.groups.SG, V5.groups.AE], "HSK Regional Pool");
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("  ", poolAddr);

  console.log("\n[HashKeyDIDBridge]");
  const DIDB = await ethers.getContractFactory("HashKeyDIDBridge");
  const did = await DIDB.deploy(V5.hskPassport, V5.groups.HK);
  await did.waitForDeployment();
  const didAddr = await did.getAddress();
  console.log("  ", didAddr);
  await (await (did as any).setDIDContract(V5.mockHashKeyDID)).wait();
  await (await passport.approveDelegate(V5.groups.HK, didAddr)).wait();

  console.log("\n[HashKeyKYCImporter]");
  const KI = await ethers.getContractFactory("HashKeyKYCImporter");
  const ki = await KI.deploy(V5.hskPassport, V5.groups.KYC, V5.groups.ACC, V5.groups.HK);
  await ki.waitForDeployment();
  const kiAddr = await ki.getAddress();
  console.log("  ", kiAddr);
  await (await (ki as any).setSBTContract(V5.mockKYCSoulbound)).wait();
  await (await passport.approveDelegate(V5.groups.KYC, kiAddr)).wait();
  await (await passport.approveDelegate(V5.groups.ACC, kiAddr)).wait();
  await (await passport.approveDelegate(V5.groups.HK, kiAddr)).wait();

  console.log("\n=== v5 final ===");
  console.log(JSON.stringify({
    hskPassport: V5.hskPassport,
    demoIssuer: V5.demoIssuer,
    gatedRWA: rwaAddr,
    kycGatedAirdrop: airAddr,
    kycGatedLending: lendAddr,
    jurisdictionGatedPool: poolAddr,
    hashKeyDIDBridge: didAddr,
    hashKeyKYCImporter: kiAddr,
    groups: V5.groups,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
