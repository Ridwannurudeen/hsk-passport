// Deploy AnonymitySetGate. Stateless, owner-less, network-agnostic — same
// deploy script works on testnet (chain 133) and mainnet (chain 177).
//
// dApps integrate by calling gate.verifyCredentialWithFloor(...) instead of
// HSKPassport.verifyCredential(...) directly. See AnonymitySetGate.sol for
// the per-method semantics.

import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  console.log("Network:   ", network.name, `(chain ${chainId})`);
  console.log("Deployer:  ", deployer.address);
  console.log("Balance:   ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "HSK\n");

  const Gate = await ethers.getContractFactory("AnonymitySetGate");
  const gate = await Gate.deploy();
  await gate.waitForDeployment();
  const addr = await gate.getAddress();
  const tx = gate.deploymentTransaction();
  console.log("AnonymitySetGate:", addr);
  console.log("Tx:              ", tx?.hash);
  console.log("WARN_BELOW_MEMBERS:", (await gate.WARN_BELOW_MEMBERS()).toString());
  console.log("DEFAULT_MIN_MEMBERS:", (await gate.DEFAULT_MIN_MEMBERS()).toString());

  const recordPath = path.resolve(
    __dirname,
    "..",
    "deployments",
    `anonymity-gate-${chainId}.json`,
  );
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(
    recordPath,
    JSON.stringify(
      {
        network: `chainId-${chainId}`,
        chainId: Number(chainId),
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        anonymitySetGate: addr,
        deployTx: tx?.hash,
      },
      null,
      2,
    ),
  );
  console.log(`\nDeployment record: ${recordPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
