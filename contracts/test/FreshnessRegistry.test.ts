import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

// Pure-Solidity tests for FreshnessRegistry — independent of the ZK circuit.
// ZK end-to-end lives in CredentialFreshnessZK.test.ts (requires compiled artefacts).

async function deployFixture() {
  const [owner, issuer, otherIssuer, outsider, newOwner] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory("FreshnessRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  return { registry, owner, issuer, otherIssuer, outsider, newOwner };
}

const GROUP_KYC = 25n;
const GROUP_ACC = 26n;

describe("FreshnessRegistry — access control", () => {
  it("deployer is owner; no issuers authorised by default", async () => {
    const { registry, owner, issuer } = await loadFixture(deployFixture);
    expect(await registry.owner()).to.equal(owner.address);
    expect(await registry.groupIssuer(GROUP_KYC, issuer.address)).to.equal(false);
  });

  it("only owner can authorise issuers", async () => {
    const { registry, owner, issuer } = await loadFixture(deployFixture);
    await expect(registry.connect(issuer).authorizeIssuer(GROUP_KYC, issuer.address))
      .to.be.revertedWithCustomError(registry, "NotOwner");
    await expect(registry.connect(owner).authorizeIssuer(GROUP_KYC, issuer.address))
      .to.emit(registry, "IssuerAuthorized").withArgs(GROUP_KYC, issuer.address);
    expect(await registry.groupIssuer(GROUP_KYC, issuer.address)).to.equal(true);
  });

  it("owner can revoke issuers", async () => {
    const { registry, owner, issuer } = await loadFixture(deployFixture);
    await registry.connect(owner).authorizeIssuer(GROUP_KYC, issuer.address);
    await expect(registry.connect(owner).revokeIssuer(GROUP_KYC, issuer.address))
      .to.emit(registry, "IssuerRevoked").withArgs(GROUP_KYC, issuer.address);
    expect(await registry.groupIssuer(GROUP_KYC, issuer.address)).to.equal(false);
  });

  it("two-step ownership transfer: pendingOwner must call acceptOwnership", async () => {
    const { registry, owner, newOwner, outsider } = await loadFixture(deployFixture);

    await expect(registry.connect(owner).transferOwnership(newOwner.address))
      .to.emit(registry, "OwnershipTransferStarted").withArgs(owner.address, newOwner.address);
    expect(await registry.owner()).to.equal(owner.address); // not yet
    expect(await registry.pendingOwner()).to.equal(newOwner.address);

    await expect(registry.connect(outsider).acceptOwnership())
      .to.be.revertedWithCustomError(registry, "NotPendingOwner");

    await expect(registry.connect(newOwner).acceptOwnership())
      .to.emit(registry, "OwnershipTransferred").withArgs(owner.address, newOwner.address);
    expect(await registry.owner()).to.equal(newOwner.address);
    expect(await registry.pendingOwner()).to.equal(ethers.ZeroAddress);
  });
});

describe("FreshnessRegistry — leaf insertion", () => {
  it("only authorised issuer can call addLeaf for that group", async () => {
    const { registry, owner, issuer } = await loadFixture(deployFixture);
    await expect(registry.connect(issuer).addLeaf(GROUP_KYC, 1n, 2n))
      .to.be.revertedWithCustomError(registry, "NotAuthorized");
    await registry.connect(owner).authorizeIssuer(GROUP_KYC, issuer.address);
    await expect(registry.connect(issuer).addLeaf(GROUP_KYC, 1n, 2n))
      .to.emit(registry, "LeafAdded").withArgs(GROUP_KYC, 1n, 2n, 0);
  });

  it("issuer authorised for one group cannot write to another", async () => {
    const { registry, owner, issuer } = await loadFixture(deployFixture);
    await registry.connect(owner).authorizeIssuer(GROUP_KYC, issuer.address);
    await expect(registry.connect(issuer).addLeaf(GROUP_ACC, 1n, 2n))
      .to.be.revertedWithCustomError(registry, "NotAuthorized");
  });

  it("rejects zero newRoot (catches issuer bugs)", async () => {
    const { registry, owner, issuer } = await loadFixture(deployFixture);
    await registry.connect(owner).authorizeIssuer(GROUP_KYC, issuer.address);
    await expect(registry.connect(issuer).addLeaf(GROUP_KYC, 1n, 0n))
      .to.be.revertedWithCustomError(registry, "InvalidRoot");
  });

  it("tracks currentRoot, leafCount, and emits with correct index", async () => {
    const { registry, owner, issuer } = await loadFixture(deployFixture);
    await registry.connect(owner).authorizeIssuer(GROUP_KYC, issuer.address);

    for (let i = 0; i < 5; i++) {
      const root = BigInt(i + 100);
      await expect(registry.connect(issuer).addLeaf(GROUP_KYC, BigInt(i), root))
        .to.emit(registry, "LeafAdded").withArgs(GROUP_KYC, BigInt(i), root, i);
      expect(await registry.currentRoot(GROUP_KYC)).to.equal(root);
      expect(await registry.leafCount(GROUP_KYC)).to.equal(BigInt(i + 1));
    }
  });
});

describe("FreshnessRegistry — root history window", () => {
  it("isKnownRoot returns true for current root", async () => {
    const { registry, owner, issuer } = await loadFixture(deployFixture);
    await registry.connect(owner).authorizeIssuer(GROUP_KYC, issuer.address);
    await registry.connect(issuer).addLeaf(GROUP_KYC, 1n, 42n);
    expect(await registry.isKnownRoot(GROUP_KYC, 42n)).to.equal(true);
  });

  it("isKnownRoot returns false for roots never seen", async () => {
    const { registry, owner, issuer } = await loadFixture(deployFixture);
    await registry.connect(owner).authorizeIssuer(GROUP_KYC, issuer.address);
    await registry.connect(issuer).addLeaf(GROUP_KYC, 1n, 42n);
    expect(await registry.isKnownRoot(GROUP_KYC, 999n)).to.equal(false);
    expect(await registry.isKnownRoot(GROUP_KYC, 0n)).to.equal(false);
  });

  it("accepts roots within the rolling window (last 100)", async () => {
    const { registry, owner, issuer } = await loadFixture(deployFixture);
    await registry.connect(owner).authorizeIssuer(GROUP_KYC, issuer.address);
    // Add 10 leaves; verify every root is still known
    for (let i = 1; i <= 10; i++) {
      await registry.connect(issuer).addLeaf(GROUP_KYC, BigInt(i), BigInt(i + 1000));
    }
    for (let i = 1; i <= 10; i++) {
      expect(await registry.isKnownRoot(GROUP_KYC, BigInt(i + 1000)))
        .to.equal(true, `root ${i + 1000} should still be known`);
    }
  });

  it("evicts roots older than the 100-entry window", async () => {
    const { registry, owner, issuer } = await loadFixture(deployFixture);
    await registry.connect(owner).authorizeIssuer(GROUP_KYC, issuer.address);
    // Add 105 leaves — the first 5 roots should be overwritten
    for (let i = 1; i <= 105; i++) {
      await registry.connect(issuer).addLeaf(GROUP_KYC, BigInt(i), BigInt(i + 1000));
    }
    // First 5 roots should be evicted
    for (let i = 1; i <= 5; i++) {
      expect(await registry.isKnownRoot(GROUP_KYC, BigInt(i + 1000)))
        .to.equal(false, `root ${i + 1000} should be evicted`);
    }
    // Last 100 should still be known
    for (let i = 6; i <= 105; i++) {
      expect(await registry.isKnownRoot(GROUP_KYC, BigInt(i + 1000)))
        .to.equal(true, `root ${i + 1000} should be retained`);
    }
  });

  it("groups maintain independent histories", async () => {
    const { registry, owner, issuer } = await loadFixture(deployFixture);
    await registry.connect(owner).authorizeIssuer(GROUP_KYC, issuer.address);
    await registry.connect(owner).authorizeIssuer(GROUP_ACC, issuer.address);
    await registry.connect(issuer).addLeaf(GROUP_KYC, 1n, 100n);
    await registry.connect(issuer).addLeaf(GROUP_ACC, 1n, 200n);
    expect(await registry.isKnownRoot(GROUP_KYC, 100n)).to.equal(true);
    expect(await registry.isKnownRoot(GROUP_KYC, 200n)).to.equal(false);
    expect(await registry.isKnownRoot(GROUP_ACC, 200n)).to.equal(true);
    expect(await registry.isKnownRoot(GROUP_ACC, 100n)).to.equal(false);
  });
});
