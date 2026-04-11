import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const passport = await ethers.getContractAt("HSKPassport", "0x728bB8D8269a826b54a45385cF87ebDD785Ed1D6");

  // Check current state
  const count = await passport.getGroupCount();
  console.log("Current group count:", count.toString());

  // The issue: Solidity overloaded functions need explicit selection in ethers v6
  // Use the function signature to disambiguate
  console.log("\nCreating groups with explicit function selector...");

  // Call createCredentialGroup(string) explicitly
  const tx1 = await passport["createCredentialGroup(string)"]("KYC_VERIFIED_V2");
  await tx1.wait();
  console.log("Group KYC_VERIFIED_V2 created");

  const tx2 = await passport["createCredentialGroup(string)"]("ACCREDITED_INVESTOR_V2");
  await tx2.wait();
  console.log("Group ACCREDITED_INVESTOR_V2 created");

  const tx3 = await passport["createCredentialGroup(string)"]("HK_RESIDENT_V2");
  await tx3.wait();
  console.log("Group HK_RESIDENT_V2 created");

  // Check new state
  const newCount = await passport.getGroupCount();
  console.log("\nNew group count:", newCount.toString());

  for (let i = 0; i < Number(newCount); i++) {
    const g = await passport.credentialGroups(i);
    console.log(`Group ${i}: name="${g.name}" active=${g.active} issuer=${g.issuer}`);
  }
}

main().catch(console.error);
