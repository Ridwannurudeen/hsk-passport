/**
 * Authorise an EOA (the backend auto-freshness wallet) to write leaves to
 * FreshnessRegistry for every credential group. One-time setup per issuer.
 *
 * Reads the FreshnessRegistry address from contracts/deployments/freshness-<chainId>.json.
 * Caller must be the registry owner — the same key that ran deploy-freshness.ts.
 *
 * Usage (testnet):
 *   ISSUER_EOA=0x... npx hardhat run --network hashkey-testnet \
 *     scripts/authorize-freshness-issuer.ts
 *
 * Idempotent: skips groups where the EOA is already authorised.
 */

import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

const GROUP_IDS = {
  KYC_VERIFIED: 25,
  ACCREDITED_INVESTOR: 26,
  HK_RESIDENT: 27,
  SG_RESIDENT: 28,
  AE_RESIDENT: 29,
};

async function main() {
  const target = process.env.ISSUER_EOA;
  if (!target || !/^0x[a-fA-F0-9]{40}$/.test(target)) {
    throw new Error("Set ISSUER_EOA to a 0x-prefixed 20-byte address (the backend wallet).");
  }

  const network = await ethers.provider.getNetwork();
  const recordPath = path.resolve(
    __dirname,
    "..",
    "deployments",
    `freshness-${network.chainId}.json`,
  );
  if (!fs.existsSync(recordPath)) {
    throw new Error(`Freshness deployment record missing: ${recordPath}. Run deploy-freshness.ts first.`);
  }
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8")) as {
    contracts: { freshnessRegistry: string };
  };
  const registryAddr = record.contracts.freshnessRegistry;

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("FreshnessRegistry", registryAddr, signer);

  const owner: string = await registry.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer ${signer.address} is not registry owner (${owner}). ` +
        "Use the deployer key, or transfer ownership first.",
    );
  }

  console.log(`Network:           chainId=${network.chainId}`);
  console.log(`FreshnessRegistry: ${registryAddr}`);
  console.log(`Authorising:       ${target}`);
  console.log(`Owner / signer:    ${signer.address}\n`);

  for (const [name, groupId] of Object.entries(GROUP_IDS)) {
    const already: boolean = await registry.groupIssuer(groupId, target);
    if (already) {
      console.log(`  ${name} (${groupId}): already authorised — skip`);
      continue;
    }
    const tx = await registry.authorizeIssuer(groupId, target);
    await tx.wait();
    console.log(`  ${name} (${groupId}): authorised — tx ${tx.hash}`);
  }

  console.log("\nDone. Restart the backend so the auto-freshness loop re-checks authorisation.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
