import { ethers } from "hardhat";

const V5 = {
  hskPassport: "0x7d2E692A08f2fb0724238396e0436106b4FbD792",
  mockHashKeyDID: "0x39931820e457949b724d28C585F821005fcaB409",
  mockKYCSoulbound: "0x195572EaE140f53CcBA065751C92659935D075E9",
  jurisdictionSetVerifier: "0x450Dbd60aC27B7bf0131c2b25451380552dd4fBb",
  groups: { KYC: 25, ACC: 26, HK: 27, SG: 28, AE: 29 },
};

async function main() {
  const passport = await ethers.getContractAt("HSKPassport", V5.hskPassport);

  // Precondition: the v5 groups (25..29) must already exist on this deployment.
  // They are created by `deploy.ts` + the four createCredentialGroup calls that
  // happened across v1..v5 of the passport. A fresh local deploy will have
  // groups 0..4 instead, so fail fast with a clear message rather than binding
  // dApps to nonexistent group IDs.
  for (const [name, id] of Object.entries(V5.groups)) {
    const g = await passport.credentialGroups(id);
    if (g.issuer === ethers.ZeroAddress) {
      throw new Error(
        `Group ${id} (${name}) does not exist on HSKPassport ${V5.hskPassport}. ` +
        `This script assumes the v5 group numbering (25..29) from the live testnet deployment. ` +
        `For a fresh deployment, either redeploy over the v5 contract or edit V5.groups to match your genesis group IDs.`
      );
    }
  }

  console.log("[JurisdictionGatedPool]");
  const Pool = await ethers.getContractFactory("JurisdictionGatedPool", {
    libraries: { JurisdictionSetVerifier: V5.jurisdictionSetVerifier },
  });
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
  try { await (await (did as any).setDIDContract(V5.mockHashKeyDID)).wait(); } catch (e) { console.log("  setDIDContract:", (e as Error).message.slice(0, 80)); }
  await (await passport.approveDelegate(V5.groups.HK, didAddr)).wait();

  console.log("\n[HashKeyKYCImporter]");
  const KI = await ethers.getContractFactory("HashKeyKYCImporter");
  const ki = await KI.deploy(V5.hskPassport, V5.groups.KYC, V5.groups.ACC, V5.groups.HK);
  await ki.waitForDeployment();
  const kiAddr = await ki.getAddress();
  console.log("  ", kiAddr);
  try { await (await (ki as any).setSBTContract(V5.mockKYCSoulbound)).wait(); } catch (e) { console.log("  setSBTContract:", (e as Error).message.slice(0, 80)); }
  await (await passport.approveDelegate(V5.groups.KYC, kiAddr)).wait();
  await (await passport.approveDelegate(V5.groups.ACC, kiAddr)).wait();
  await (await passport.approveDelegate(V5.groups.HK, kiAddr)).wait();

  console.log("\n=== v5 final ===");
  console.log(JSON.stringify({
    hskPassport: V5.hskPassport,
    demoIssuer: "0xBf7d566B8077A098F6844fb6b827D2A4118C88C3",
    gatedRWA: "0xb6955cb3e442c4222fFc3b92c322851109d0b9c9",
    kycGatedAirdrop: "0x71c96016CBCAeE7B2Edc8b40Fec45de1d16Fb4b8",
    kycGatedLending: "0x37179886986bd35a4d580f157f55f249c43A0BFD",
    jurisdictionGatedPool: poolAddr,
    hashKeyDIDBridge: didAddr,
    hashKeyKYCImporter: kiAddr,
    groups: V5.groups,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
