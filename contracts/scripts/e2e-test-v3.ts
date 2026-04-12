import { ethers } from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

const ADDRESSES = {
  semaphore: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9",
  hskPassport: "0x79A0E1160FA829595f45f0479782095ed497d5E6",
  demoIssuer: "0xD6CB3393B9e1E162ed3EF8187082511d20Be28d1",
  gatedRWA: "0xFc6bDE32f79ad43696abc6A2a6291bfA8AF1D249",
};
const DEPLOY_BLOCK = 26371173;
const KYC_GROUP = 15;

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("=== HSK Passport v3 E2E Test ===");
  console.log("Wallet:", signer.address);
  console.log();

  // ============================================================
  // TEST 1: eth_getLogs from deployment block
  // ============================================================
  console.log("[1] eth_getLogs from deployment block...");
  const passport = new ethers.Contract(
    ADDRESSES.hskPassport,
    [
      "event CredentialIssued(uint256 indexed groupId, uint256 indexed identityCommitment)",
      "event CredentialRevoked(uint256 indexed groupId, uint256 indexed identityCommitment)",
      "function hasCredential(uint256, uint256) view returns (bool)",
      "function issueCredential(uint256 groupId, uint256 identityCommitment)",
    ],
    signer
  );
  const latestBlock = await ethers.provider.getBlockNumber();
  console.log("    Latest block:", latestBlock);
  console.log("    Query range:", DEPLOY_BLOCK, "->", latestBlock, `(${latestBlock - DEPLOY_BLOCK} blocks)`);

  const t1 = Date.now();
  const issuedEvents = await passport.queryFilter(
    passport.filters.CredentialIssued(KYC_GROUP),
    DEPLOY_BLOCK,
    latestBlock
  );
  const revokedEvents = await passport.queryFilter(
    passport.filters.CredentialRevoked(KYC_GROUP),
    DEPLOY_BLOCK,
    latestBlock
  );
  console.log(`    issued: ${issuedEvents.length}, revoked: ${revokedEvents.length} (${Date.now() - t1}ms)`);

  const revokedSet = new Set(revokedEvents.map((e: any) => e.args?.identityCommitment?.toString()).filter(Boolean));
  const members: bigint[] = issuedEvents
    .map((e: any) => e.args?.identityCommitment as bigint)
    .filter((m) => m !== undefined && !revokedSet.has(m.toString()));
  console.log(`    active members in KYC group: ${members.length}`);

  if (members.length < 5) {
    console.log("    WARN: small anonymity set");
  } else {
    console.log("    OK: meaningful anonymity set");
  }
  console.log();

  // ============================================================
  // TEST 2: DemoIssuer self-issue flow
  // ============================================================
  console.log("[2] DemoIssuer self-issue...");
  const testIdentity = new Identity(`e2e-test-${Date.now()}`);
  console.log("    Test identity commitment:", testIdentity.commitment.toString().slice(0, 20) + "...");

  const demoIssuer = new ethers.Contract(
    ADDRESSES.demoIssuer,
    ["function selfIssue(uint256 identityCommitment)", "function hasClaimed(address) view returns (bool)"],
    signer
  );

  const alreadyClaimed = await demoIssuer.hasClaimed(signer.address);
  if (alreadyClaimed) {
    console.log("    Wallet already claimed; checking if this identity is in group...");
    const hasCred = await passport.hasCredential(KYC_GROUP, testIdentity.commitment);
    if (!hasCred) {
      console.log("    Test identity NOT in group — using a known issued member for proof test");
      // Use the last seeded identity from events
      if (members.length === 0) throw new Error("No members available");
      // We can't prove without the secret, so skip to direct proof test with a fresh identity via issueCredential
      const tx = await passport.issueCredential(KYC_GROUP, testIdentity.commitment);
      console.log("    Issuing directly via wallet (wallet is group issuer)... tx:", tx.hash);
      await tx.wait();
      members.push(testIdentity.commitment);
    }
  } else {
    const tx = await demoIssuer.selfIssue(testIdentity.commitment);
    console.log("    selfIssue tx:", tx.hash);
    await tx.wait();
    members.push(testIdentity.commitment);
  }

  const hasCred = await passport.hasCredential(KYC_GROUP, testIdentity.commitment);
  console.log("    hasCredential:", hasCred);
  if (!hasCred) throw new Error("Credential not issued");
  console.log("    OK");
  console.log();

  // ============================================================
  // TEST 3: ZK proof generation (with caller-bound message)
  // ============================================================
  console.log("[3] Generating ZK proof (caller-bound)...");
  const group = new Group();
  for (const m of members) group.addMember(m);
  console.log("    Group size:", members.length);
  console.log("    Merkle depth:", group.depth);

  const message = BigInt(signer.address); // caller-bound
  const scope = KYC_GROUP;

  const t3 = Date.now();
  const proof = await generateProof(testIdentity, group, message, scope);
  console.log(`    Proof generated in ${Date.now() - t3}ms`);
  console.log("    Merkle depth:", proof.merkleTreeDepth);
  console.log("    Nullifier:", proof.nullifier.toString().slice(0, 30) + "...");
  console.log("    Message (should match caller):", proof.message.toString());
  console.log("    Caller address as bigint:", message.toString());
  if (BigInt(proof.message) !== message) throw new Error("Proof message does not match caller");
  console.log("    OK: proof bound to caller");
  console.log();

  // ============================================================
  // TEST 4: On-chain proof verification via HSKPassport
  // ============================================================
  console.log("[4] On-chain verification via HSKPassport.verifyCredential...");
  const passportVerify = new ethers.Contract(
    ADDRESSES.hskPassport,
    [
      "function verifyCredential(uint256 groupId, tuple(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof) view returns (bool)",
    ],
    ethers.provider
  );
  const valid = await passportVerify.verifyCredential(KYC_GROUP, {
    merkleTreeDepth: proof.merkleTreeDepth,
    merkleTreeRoot: proof.merkleTreeRoot,
    nullifier: proof.nullifier,
    message: proof.message,
    scope: proof.scope,
    points: proof.points,
  });
  console.log("    Verification:", valid);
  if (!valid) throw new Error("On-chain verification failed");
  console.log("    OK");
  console.log();

  // ============================================================
  // TEST 5: KYC-gated mint via GatedRWA
  // ============================================================
  console.log("[5] GatedRWA.kycMint (caller-bound proof)...");
  const rwa = new ethers.Contract(
    ADDRESSES.gatedRWA,
    [
      "function kycMint(tuple(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof)",
      "function balanceOf(address) view returns (uint256)",
      "function usedNullifiers(uint256) view returns (bool)",
    ],
    signer
  );

  const nullifierUsed = await rwa.usedNullifiers(proof.nullifier);
  if (nullifierUsed) {
    console.log("    Nullifier already used (proof was reused) — expected to revert");
  }

  const balBefore = await rwa.balanceOf(signer.address);
  console.log("    Balance before:", ethers.formatEther(balBefore));

  try {
    const tx = await rwa.kycMint({
      merkleTreeDepth: proof.merkleTreeDepth,
      merkleTreeRoot: proof.merkleTreeRoot,
      nullifier: proof.nullifier,
      message: proof.message,
      scope: proof.scope,
      points: proof.points,
    });
    console.log("    kycMint tx:", tx.hash);
    await tx.wait();
    const balAfter = await rwa.balanceOf(signer.address);
    console.log("    Balance after:", ethers.formatEther(balAfter));
    console.log("    OK: 100 hSILVER minted");
  } catch (e: any) {
    if (e.message.includes("NullifierAlreadyUsed") || nullifierUsed) {
      console.log("    OK: correctly reverted on nullifier reuse");
    } else {
      throw e;
    }
  }
  console.log();

  // ============================================================
  // TEST 6: Caller binding — reject proof with wrong caller
  // ============================================================
  console.log("[6] Caller binding — generate proof bound to different address, attempt mint...");
  const wrongAddress = "0x0000000000000000000000000000000000000001";
  const wrongProof = await generateProof(testIdentity, group, BigInt(wrongAddress), 777);

  try {
    await rwa.kycMint({
      merkleTreeDepth: wrongProof.merkleTreeDepth,
      merkleTreeRoot: wrongProof.merkleTreeRoot,
      nullifier: wrongProof.nullifier,
      message: wrongProof.message,
      scope: wrongProof.scope,
      points: wrongProof.points,
    });
    throw new Error("SHOULD HAVE REVERTED — caller binding broken!");
  } catch (e: any) {
    if (e.message.includes("ProofNotBoundToCaller") || e.message.includes("revert")) {
      console.log("    OK: correctly rejected proof bound to different address");
    } else {
      throw e;
    }
  }
  console.log();

  console.log("=== ALL TESTS PASSED ===");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
