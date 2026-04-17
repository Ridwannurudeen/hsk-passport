import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  FreshnessTree,
  generateFreshnessProof,
  ensureArtefacts,
} from "./helpers/freshnessProof";

// These tests require the compiled ZK artefacts. If they're missing, skip the whole
// suite with a clear message rather than failing every case.
const ARTEFACTS_PRESENT = (() => {
  const base = path.resolve(__dirname, "..", "..", "circuits", "build");
  return (
    fs.existsSync(path.join(base, "credential_freshness_js", "credential_freshness.wasm")) &&
    fs.existsSync(path.join(base, "freshness_final.zkey"))
  );
})();

const GROUP_KYC = 25n;
const SECONDS_PER_DAY = 86_400n;

async function freshnessFixture() {
  const [owner, issuer] = await ethers.getSigners();

  const Registry = await ethers.getContractFactory("FreshnessRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const Verifier = await ethers.getContractFactory("FreshnessVerifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();

  const Composer = await ethers.getContractFactory("HSKPassportFreshness");
  const composer = await Composer.deploy(
    await registry.getAddress(),
    await verifier.getAddress()
  );
  await composer.waitForDeployment();

  await registry.connect(owner).authorizeIssuer(GROUP_KYC, issuer.address);

  return { registry, verifier, composer, owner, issuer };
}

(ARTEFACTS_PRESENT ? describe : describe.skip)("CredentialFreshness — ZK end to end", () => {
  before(() => ensureArtefacts());

  it("valid fresh proof verifies and marks nullifier consumed", async () => {
    const { registry, composer, issuer } = await loadFixture(freshnessFixture);

    const identitySecret = 1234567890123456789n;
    const identityCommitment = FreshnessTree.identityCommitment(identitySecret);

    const now = BigInt(await time.latest());
    const issuanceTime = now - SECONDS_PER_DAY; // issued 1 day ago
    const earliestAcceptable = now - 30n * SECONDS_PER_DAY; // 30-day freshness window

    // Build an off-chain tree with this leaf + a few dummy leaves for realism
    const tree = new FreshnessTree();
    tree.insert(FreshnessTree.makeLeaf(10n, 1n));
    tree.insert(FreshnessTree.makeLeaf(20n, 2n));
    const leaf = FreshnessTree.makeLeaf(identityCommitment, issuanceTime);
    const index = tree.insert(leaf);
    const proof = tree.proof(index);

    // Register root on-chain
    await registry.connect(issuer).addLeaf(GROUP_KYC, leaf, proof.root);

    const scope = BigInt(ethers.keccak256(ethers.toUtf8Bytes("test-scope"))) &
      ((1n << 250n) - 1n); // keep scope < field modulus

    const zk = await generateFreshnessProof({
      identitySecret,
      issuanceTime,
      merkleProof: proof,
      earliestAcceptable,
      scope,
    });

    expect(zk.merkleRoot).to.equal(proof.root);
    expect(zk.earliestAcceptable).to.equal(earliestAcceptable);
    expect(zk.scope).to.equal(scope);

    await expect(
      composer.verifyFresh(
        GROUP_KYC,
        zk.merkleRoot,
        zk.earliestAcceptable,
        zk.scope,
        zk.nullifier,
        zk.proofA,
        zk.proofB,
        zk.proofC
      )
    )
      .to.emit(composer, "FreshnessProofVerified")
      .withArgs(GROUP_KYC, zk.scope, zk.nullifier, zk.earliestAcceptable);

    expect(await composer.nullifierConsumed(zk.scope, zk.nullifier)).to.equal(true);
  });

  it("same nullifier + scope reverts with NullifierAlreadyUsed on replay", async () => {
    const { registry, composer, issuer } = await loadFixture(freshnessFixture);

    const identitySecret = 42n;
    const now = BigInt(await time.latest());
    const issuanceTime = now - SECONDS_PER_DAY;
    const earliestAcceptable = now - 30n * SECONDS_PER_DAY;
    const identityCommitment = FreshnessTree.identityCommitment(identitySecret);

    const tree = new FreshnessTree();
    const leaf = FreshnessTree.makeLeaf(identityCommitment, issuanceTime);
    const index = tree.insert(leaf);
    const mp = tree.proof(index);
    await registry.connect(issuer).addLeaf(GROUP_KYC, leaf, mp.root);

    const scope = 777n;
    const zk = await generateFreshnessProof({
      identitySecret,
      issuanceTime,
      merkleProof: mp,
      earliestAcceptable,
      scope,
    });

    await composer.verifyFresh(
      GROUP_KYC,
      zk.merkleRoot,
      zk.earliestAcceptable,
      zk.scope,
      zk.nullifier,
      zk.proofA,
      zk.proofB,
      zk.proofC
    );

    await expect(
      composer.verifyFresh(
        GROUP_KYC,
        zk.merkleRoot,
        zk.earliestAcceptable,
        zk.scope,
        zk.nullifier,
        zk.proofA,
        zk.proofB,
        zk.proofC
      )
    ).to.be.revertedWithCustomError(composer, "NullifierAlreadyUsed");
  });

  it("expired credential: issuanceTime < earliestAcceptable → proof generation fails", async () => {
    const { registry, issuer } = await loadFixture(freshnessFixture);

    const identitySecret = 7n;
    const now = BigInt(await time.latest());
    const issuanceTime = now - 100n * SECONDS_PER_DAY; // 100 days old
    const earliestAcceptable = now - 30n * SECONDS_PER_DAY; // require <= 30 days
    const identityCommitment = FreshnessTree.identityCommitment(identitySecret);

    const tree = new FreshnessTree();
    const leaf = FreshnessTree.makeLeaf(identityCommitment, issuanceTime);
    const index = tree.insert(leaf);
    const mp = tree.proof(index);
    await registry.connect(issuer).addLeaf(GROUP_KYC, leaf, mp.root);

    // snarkjs throws when the circuit's GreaterEqThan constraint is unsatisfied
    await expect(
      generateFreshnessProof({
        identitySecret,
        issuanceTime,
        merkleProof: mp,
        earliestAcceptable,
        scope: 1n,
      })
    ).to.be.rejected;
  });

  it("unknown root: registry doesn't know the proof's root → UnknownRoot", async () => {
    const { composer } = await loadFixture(freshnessFixture);

    const identitySecret = 9n;
    const now = BigInt(await time.latest());
    const issuanceTime = now - SECONDS_PER_DAY;
    const identityCommitment = FreshnessTree.identityCommitment(identitySecret);

    // Build a tree + proof that the registry has NOT been told about
    const tree = new FreshnessTree();
    const leaf = FreshnessTree.makeLeaf(identityCommitment, issuanceTime);
    const index = tree.insert(leaf);
    const mp = tree.proof(index);

    const zk = await generateFreshnessProof({
      identitySecret,
      issuanceTime,
      merkleProof: mp,
      earliestAcceptable: now - 30n * SECONDS_PER_DAY,
      scope: 42n,
    });

    await expect(
      composer.verifyFresh(
        GROUP_KYC,
        zk.merkleRoot,
        zk.earliestAcceptable,
        zk.scope,
        zk.nullifier,
        zk.proofA,
        zk.proofB,
        zk.proofC
      )
    ).to.be.revertedWithCustomError(composer, "UnknownRoot");
  });

  it("tampered public signal (wrong earliestAcceptable) → InvalidProof", async () => {
    const { registry, composer, issuer } = await loadFixture(freshnessFixture);

    const identitySecret = 11n;
    const now = BigInt(await time.latest());
    const issuanceTime = now - SECONDS_PER_DAY;
    const earliestAcceptable = now - 30n * SECONDS_PER_DAY;
    const identityCommitment = FreshnessTree.identityCommitment(identitySecret);

    const tree = new FreshnessTree();
    const leaf = FreshnessTree.makeLeaf(identityCommitment, issuanceTime);
    const index = tree.insert(leaf);
    const mp = tree.proof(index);
    await registry.connect(issuer).addLeaf(GROUP_KYC, leaf, mp.root);

    const zk = await generateFreshnessProof({
      identitySecret,
      issuanceTime,
      merkleProof: mp,
      earliestAcceptable,
      scope: 55n,
    });

    // Caller alters earliestAcceptable post-proof — signal mismatch forces verifier to reject
    await expect(
      composer.verifyFresh(
        GROUP_KYC,
        zk.merkleRoot,
        earliestAcceptable + 1n, // tampered
        zk.scope,
        zk.nullifier,
        zk.proofA,
        zk.proofB,
        zk.proofC
      )
    ).to.be.revertedWithCustomError(composer, "InvalidProof");
  });

  it("different scope with same secret produces different nullifier (no cross-scope replay)", async () => {
    const { registry, composer, issuer } = await loadFixture(freshnessFixture);

    const identitySecret = 13n;
    const now = BigInt(await time.latest());
    const issuanceTime = now - SECONDS_PER_DAY;
    const earliestAcceptable = now - 30n * SECONDS_PER_DAY;
    const identityCommitment = FreshnessTree.identityCommitment(identitySecret);

    const tree = new FreshnessTree();
    const leaf = FreshnessTree.makeLeaf(identityCommitment, issuanceTime);
    const index = tree.insert(leaf);
    const mp = tree.proof(index);
    await registry.connect(issuer).addLeaf(GROUP_KYC, leaf, mp.root);

    const zk1 = await generateFreshnessProof({
      identitySecret,
      issuanceTime,
      merkleProof: mp,
      earliestAcceptable,
      scope: 1n,
    });
    const zk2 = await generateFreshnessProof({
      identitySecret,
      issuanceTime,
      merkleProof: mp,
      earliestAcceptable,
      scope: 2n,
    });

    expect(zk1.nullifier).to.not.equal(zk2.nullifier);

    await composer.verifyFresh(GROUP_KYC, zk1.merkleRoot, zk1.earliestAcceptable, zk1.scope, zk1.nullifier, zk1.proofA, zk1.proofB, zk1.proofC);
    await composer.verifyFresh(GROUP_KYC, zk2.merkleRoot, zk2.earliestAcceptable, zk2.scope, zk2.nullifier, zk2.proofA, zk2.proofB, zk2.proofC);
  });
});
