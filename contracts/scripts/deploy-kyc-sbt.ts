// Deploy the IKycSBT-compatible stack to HashKey Chain testnet:
//  MockKycSBT (implements HashKey's official IKycSBT interface) →
//  HashKeyKycSBTAdapter (wraps it for HSK Passport compatibility).
//
// When the HashKey team publishes the real IKycSBT contract address, the
// adapter can be redeployed against it with one env var change.

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "HSK\n");

  console.log("[1/2] Deploying MockKycSBT (official IKycSBT interface)...");
  const Mock = await ethers.getContractFactory("MockKycSBT");
  const mock = await Mock.deploy();
  await mock.waitForDeployment();
  const mockAddr = await mock.getAddress();
  console.log("  MockKycSBT:", mockAddr);

  console.log("\n[2/2] Deploying HashKeyKycSBTAdapter...");
  const Adapter = await ethers.getContractFactory("HashKeyKycSBTAdapter");
  const adapter = await Adapter.deploy(mockAddr);
  await adapter.waitForDeployment();
  const adapterAddr = await adapter.getAddress();
  console.log("  HashKeyKycSBTAdapter:", adapterAddr);

  console.log("\n=== Deployment ===");
  console.log(JSON.stringify({
    network: "hashkey-testnet",
    mockKycSBT: mockAddr,
    hashKeyKycSBTAdapter: adapterAddr,
    note: "MockKycSBT implements HashKey's official IKycSBT interface verbatim. Repoint the adapter at the production IKycSBT address when hunyuankyc publishes it.",
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
