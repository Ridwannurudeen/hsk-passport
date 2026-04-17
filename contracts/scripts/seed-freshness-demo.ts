/**
 * Seed the FreshnessRegistry with a known demo credential so `/demo/fresh` can
 * do a real end-to-end on-chain verification (not just previewVerifyFresh
 * returning UnknownRoot).
 *
 * Steps:
 *   1. Authorise the deployer for the KYC_VERIFIED group (one-time).
 *   2. Build an 8-leaf demo tree (7 deterministic dummies + 1 real leaf using
 *      identitySecret = 1, issuanceTime = now - 30 days).
 *   3. Submit the root on-chain via FreshnessRegistry.addLeaf.
 *   4. Write deployments/freshness-demo-133.json with everything the frontend
 *      needs to reconstruct the proof: secret, issuanceTime, leaves, root.
 *
 * Re-runnable: if the deployer is already authorised the authorise call is
 * skipped; the seed tree is regenerated and a fresh leaf is pushed each run.
 */

import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";
import { poseidon1, poseidon2 } from "poseidon-lite";

const TREE_DEPTH = 16;
const GROUP_KYC = 25n;
const DEMO_IDENTITY_SECRET = 1n;

function zeroRoots(depth: number): bigint[] {
  const zeros: bigint[] = new Array(depth + 1);
  zeros[0] = 0n;
  for (let i = 1; i <= depth; i++) zeros[i] = poseidon2([zeros[i - 1], zeros[i - 1]]);
  return zeros;
}

function computeRoot(leaves: bigint[], depth: number): bigint {
  const zeros = zeroRoots(depth);
  let layer = leaves.slice();
  for (let level = 0; level < depth; level++) {
    const next: bigint[] = [];
    for (let i = 0; i < Math.max(layer.length, 1); i += 2) {
      const left = i < layer.length ? layer[i] : zeros[level];
      const right = i + 1 < layer.length ? layer[i + 1] : zeros[level];
      next.push(poseidon2([left, right]));
    }
    layer = next;
  }
  return layer[0] ?? zeros[depth];
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network:  chainId=${network.chainId}\n`);

  // Load freshness addresses from the record produced by deploy-freshness.ts
  const recordPath = path.resolve(__dirname, "..", "deployments", `freshness-${network.chainId}.json`);
  if (!fs.existsSync(recordPath)) {
    throw new Error(`Freshness deployment record not found at ${recordPath}. Run deploy-freshness.ts first.`);
  }
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8")) as {
    contracts: { freshnessRegistry: string };
  };
  const registryAddr = record.contracts.freshnessRegistry;
  console.log(`FreshnessRegistry: ${registryAddr}\n`);

  const registry = await ethers.getContractAt("FreshnessRegistry", registryAddr, deployer);

  // 1. Authorise deployer (idempotent — skip if already authorised)
  const alreadyAuth: boolean = await registry.groupIssuer(GROUP_KYC, deployer.address);
  if (!alreadyAuth) {
    console.log("--- 1/3 Authorising deployer as freshness issuer (KYC_VERIFIED) ---");
    const tx = await registry.authorizeIssuer(GROUP_KYC, deployer.address);
    await tx.wait();
    console.log(`  tx: ${tx.hash}\n`);
  } else {
    console.log("Deployer already authorised for KYC_VERIFIED — skipping authorise.\n");
  }

  // 2. Build an 8-leaf tree: 7 deterministic dummies + 1 real leaf
  const issuanceTime = BigInt(Math.floor(Date.now() / 1000)) - 30n * 86_400n; // 30 days ago
  const demoCommitment = poseidon1([DEMO_IDENTITY_SECRET]);
  const demoLeaf = poseidon2([demoCommitment, issuanceTime]);

  const leaves: bigint[] = [];
  for (let i = 1; i <= 7; i++) {
    const dummySecret = BigInt(i * 1_000_003);
    const dummyCommit = poseidon1([dummySecret]);
    const dummyTime = BigInt(1_000_000 + i);
    leaves.push(poseidon2([dummyCommit, dummyTime]));
  }
  leaves.push(demoLeaf);

  const root = computeRoot(leaves, TREE_DEPTH);
  console.log("--- 2/3 Seed tree computed ---");
  console.log(`  leafCount:    ${leaves.length}`);
  console.log(`  demoLeaf:     ${demoLeaf}`);
  console.log(`  root:         ${root}`);
  console.log(`  issuanceTime: ${issuanceTime} (${new Date(Number(issuanceTime) * 1000).toISOString()})\n`);

  // 3. Push root on-chain via addLeaf. Registry trusts issuer to supply the
  //    correct newRoot — we compute it off-chain to match exactly what the
  //    frontend will derive.
  console.log("--- 3/3 Posting root on-chain ---");
  // Submit the 7 dummy leaves + 1 real leaf as a sequence. Off-chain we already
  // computed the final root; the registry records each intermediate root in the
  // rolling window, so in-flight proofs generated against earlier roots also
  // work. For the demo we only care that the final root is the current one.
  let runningLeaves: bigint[] = [];
  for (let i = 0; i < leaves.length; i++) {
    runningLeaves.push(leaves[i]);
    const intermediateRoot = computeRoot(runningLeaves, TREE_DEPTH);
    const tx = await registry.addLeaf(GROUP_KYC, leaves[i], intermediateRoot);
    await tx.wait();
    console.log(`  leaf[${i}] → root ${intermediateRoot.toString(16).slice(0, 12)}… (tx ${tx.hash.slice(0, 12)}…)`);
  }

  const onChainRoot: bigint = await registry.currentRoot(GROUP_KYC);
  if (onChainRoot !== root) {
    throw new Error(`Root mismatch: on-chain ${onChainRoot} vs computed ${root}`);
  }
  console.log(`\n✓ on-chain currentRoot matches off-chain computation (${root.toString(16).slice(0, 12)}…)\n`);

  // 4. Persist demo data for the frontend
  const demoRecord = {
    network: `chainId-${network.chainId}`,
    chainId: Number(network.chainId),
    seededAt: new Date().toISOString(),
    freshnessRegistry: registryAddr,
    groupId: Number(GROUP_KYC),
    demoIdentity: {
      secret: DEMO_IDENTITY_SECRET.toString(),
      commitment: demoCommitment.toString(),
      issuanceTime: issuanceTime.toString(),
      issuanceTimeISO: new Date(Number(issuanceTime) * 1000).toISOString(),
      leafIndex: 7,
    },
    tree: {
      depth: TREE_DEPTH,
      leaves: leaves.map((l) => l.toString()),
      root: root.toString(),
    },
  };

  const outDir = path.resolve(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `freshness-demo-${network.chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(demoRecord, null, 2));

  // Also drop a copy where the frontend can import it directly at build time
  const frontendOut = path.resolve(__dirname, "..", "..", "frontend", "src", "lib", "freshness-demo-data.json");
  fs.writeFileSync(frontendOut, JSON.stringify(demoRecord, null, 2));

  console.log(`Demo record (contracts): ${outFile}`);
  console.log(`Demo record (frontend):  ${frontendOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
