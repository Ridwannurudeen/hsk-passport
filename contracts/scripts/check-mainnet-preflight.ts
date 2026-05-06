// One-shot preflight read for the mainnet handoff.
import { ethers } from "hardhat";

const REGISTRY = "0xf109cBe3D8d54D77C85ECF1367Cfcd6f075868e9";

async function main() {
  const r = await ethers.getContractAt("IssuerRegistry", REGISTRY);
  const owner: string = await r.owner();
  const slashing: string = await r.slashingAuthority();
  const ownerBal = await ethers.provider.getBalance(owner);
  console.log("owner:             ", owner);
  console.log("slashingAuthority: ", slashing);
  console.log("owner balance:     ", ethers.formatEther(ownerBal), "HSK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
