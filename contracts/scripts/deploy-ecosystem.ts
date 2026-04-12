import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ecosystem dApps with:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "HSK\n");

  const PASSPORT = "0x79A0E1160FA829595f45f0479782095ed497d5E6";
  const KYC_GROUP = 15;
  const ACCREDITED_GROUP = 16;

  // 1. Deploy KYCGatedAirdrop
  console.log("1. Deploying KYCGatedAirdrop (HK_PILOT)...");
  const Airdrop = await ethers.getContractFactory("KYCGatedAirdrop");
  const airdrop = await Airdrop.deploy(
    PASSPORT,
    KYC_GROUP,
    ethers.parseEther("50"),
    "HashKey Pilot Airdrop",
    "hPILOT"
  );
  await airdrop.waitForDeployment();
  const airdropAddr = await airdrop.getAddress();
  console.log("   KYCGatedAirdrop:", airdropAddr);

  // 2. Deploy KYCGatedLending
  console.log("\n2. Deploying KYCGatedLending (Accredited pool)...");
  const Lending = await ethers.getContractFactory("KYCGatedLending");
  const lending = await Lending.deploy(PASSPORT, ACCREDITED_GROUP);
  await lending.waitForDeployment();
  const lendingAddr = await lending.getAddress();
  console.log("   KYCGatedLending:", lendingAddr);

  // 3. Seed lending pool with some liquidity
  console.log("\n3. Seeding lending pool with 0.01 HSK liquidity...");
  const seedTx = await lending.deposit({ value: ethers.parseEther("0.01") });
  await seedTx.wait();
  console.log("   Seeded. Total deposits:", ethers.formatEther(await lending.totalDeposits()));

  console.log("\n=== ECOSYSTEM CONTRACTS ===");
  console.log("KYCGatedAirdrop (hPILOT):", airdropAddr);
  console.log("KYCGatedLending:         ", lendingAddr);

  const fs = await import("fs");
  fs.writeFileSync("deployment-ecosystem.json", JSON.stringify({
    kycGatedAirdrop: airdropAddr,
    kycGatedLending: lendingAddr,
  }, null, 2));
}

main().catch(console.error);
