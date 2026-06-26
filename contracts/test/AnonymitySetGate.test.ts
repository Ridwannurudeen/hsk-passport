import { expect } from "chai";
import { ethers } from "hardhat";

const ZERO_PROOF = {
  merkleTreeDepth: 0n,
  merkleTreeRoot: 0n,
  nullifier: 0n,
  message: 0n,
  scope: 0n,
  points: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
};
const ZERO_2 = [0n, 0n] as const;
const ZERO_2_2 = [
  [0n, 0n],
  [0n, 0n],
] as const;

describe("AnonymitySetGate", function () {
  let gate: any;
  let mockPassport: any;
  let mockComposer: any;
  let mockRegistry: any;

  before(async function () {
    const Gate = await ethers.getContractFactory("AnonymitySetGate");
    gate = await Gate.deploy();

    const MockPassport = await ethers.getContractFactory("MockHSKPassport");
    mockPassport = await MockPassport.deploy();

    const MockComposer = await ethers.getContractFactory("MockHSKPassportFreshness");
    mockComposer = await MockComposer.deploy();

    const MockRegistry = await ethers.getContractFactory("MockFreshnessRegistry");
    mockRegistry = await MockRegistry.deploy();
  });

  describe("constants", function () {
    it("exposes WARN_BELOW_MEMBERS = 10000", async function () {
      expect(await gate.WARN_BELOW_MEMBERS()).to.equal(10_000n);
    });
    it("exposes DEFAULT_MIN_MEMBERS = 1000", async function () {
      expect(await gate.DEFAULT_MIN_MEMBERS()).to.equal(1_000n);
    });
  });

  describe("verifyCredentialWithFloor", function () {
    it("reverts AnonymitySetTooSmall when size below explicit floor", async function () {
      await mockPassport.setGroup(7, 50, true);
      await expect(
        gate.verifyCredentialWithFloor(await mockPassport.getAddress(), 7, ZERO_PROOF, 100),
      )
        .to.be.revertedWithCustomError(gate, "AnonymitySetTooSmall")
        .withArgs(7, 50, 100);
    });

    it("reverts when size below DEFAULT_MIN_MEMBERS (minMembers=0)", async function () {
      await mockPassport.setGroup(7, 999, true);
      await expect(
        gate.verifyCredentialWithFloor(await mockPassport.getAddress(), 7, ZERO_PROOF, 0),
      )
        .to.be.revertedWithCustomError(gate, "AnonymitySetTooSmall")
        .withArgs(7, 999, 1_000);
    });

    it("emits LowAnonymitySet when floor satisfied but size < 10000", async function () {
      await mockPassport.setGroup(7, 1500, true);
      await expect(
        gate.verifyCredentialWithFloor(await mockPassport.getAddress(), 7, ZERO_PROOF, 1000),
      )
        .to.emit(gate, "LowAnonymitySet")
        .withArgs(7, 1500, 10_000);
    });

    it("does NOT emit warning when size >= 10000", async function () {
      await mockPassport.setGroup(7, 10_000, true);
      await expect(
        gate.verifyCredentialWithFloor(await mockPassport.getAddress(), 7, ZERO_PROOF, 1000),
      ).to.not.emit(gate, "LowAnonymitySet");
    });

    it("forwards verifyCredential's return value", async function () {
      await mockPassport.setGroup(7, 1500, true);
      await mockPassport.setVerifyResult(true);
      // staticCall lets us read the return value of a non-view function (the
      // gate is non-view because it might emit, even though it doesn't change
      // any storage of its own).
      const ok = await gate.verifyCredentialWithFloor.staticCall(
        await mockPassport.getAddress(),
        7,
        ZERO_PROOF,
        1000,
      );
      expect(ok).to.equal(true);

      await mockPassport.setVerifyResult(false);
      const notOk = await gate.verifyCredentialWithFloor.staticCall(
        await mockPassport.getAddress(),
        7,
        ZERO_PROOF,
        1000,
      );
      expect(notOk).to.equal(false);
    });
  });

  describe("verifyCredentialWithExpiryAndFloor", function () {
    it("reverts when size below floor, regardless of expiry", async function () {
      await mockPassport.setGroup(8, 10, true);
      await expect(
        gate.verifyCredentialWithExpiryAndFloor(
          await mockPassport.getAddress(),
          8,
          ZERO_PROOF,
          0,
          100,
        ),
      ).to.be.revertedWithCustomError(gate, "AnonymitySetTooSmall");
    });

    it("emits warn when size in [floor, 10000)", async function () {
      await mockPassport.setGroup(8, 5000, true);
      await expect(
        gate.verifyCredentialWithExpiryAndFloor(
          await mockPassport.getAddress(),
          8,
          ZERO_PROOF,
          0,
          1000,
        ),
      )
        .to.emit(gate, "LowAnonymitySet")
        .withArgs(8, 5000, 10_000);
    });
  });

  describe("verifyFreshWithFloor", function () {
    it("reverts when leafCount below floor", async function () {
      await mockRegistry.set(25, 100);
      await expect(
        gate.verifyFreshWithFloor(
          await mockComposer.getAddress(),
          await mockRegistry.getAddress(),
          25,
          0,
          0,
          0,
          0,
          ZERO_2,
          ZERO_2_2,
          ZERO_2,
          200,
        ),
      ).to.be.revertedWithCustomError(gate, "AnonymitySetTooSmall");
    });

    it("emits warn when leafCount < 10000", async function () {
      await mockRegistry.set(25, 5000);
      await expect(
        gate.verifyFreshWithFloor(
          await mockComposer.getAddress(),
          await mockRegistry.getAddress(),
          25,
          0,
          0,
          0,
          0,
          ZERO_2,
          ZERO_2_2,
          ZERO_2,
          1000,
        ),
      ).to.emit(gate, "LowAnonymitySet");
    });

    it("returns true when the composer verifies a fresh proof", async function () {
      await mockRegistry.set(25, 5000);
      await mockComposer.setVerifyResult(true);
      const ok = await gate.verifyFreshWithFloor.staticCall(
        await mockComposer.getAddress(),
        await mockRegistry.getAddress(),
        25,
        0,
        0,
        0,
        0,
        ZERO_2,
        ZERO_2_2,
        ZERO_2,
        1000,
      );
      expect(ok).to.equal(true);
    });

    it("reverts when the composer rejects the proof (consuming path, no replay)", async function () {
      await mockRegistry.set(25, 5000);
      await mockComposer.setVerifyResult(false);
      await expect(
        gate.verifyFreshWithFloor(
          await mockComposer.getAddress(),
          await mockRegistry.getAddress(),
          25,
          0,
          0,
          0,
          0,
          ZERO_2,
          ZERO_2_2,
          ZERO_2,
          1000,
        ),
      ).to.be.revertedWithCustomError(mockComposer, "FreshProofRejected");
    });
  });

  describe("inspect / inspectFreshness", function () {
    it("returns size and flags without reverting on small group", async function () {
      await mockPassport.setGroup(9, 50, true);
      const [size, hardOk, soft] = await gate.inspect(await mockPassport.getAddress(), 9, 100);
      expect(size).to.equal(50n);
      expect(hardOk).to.equal(false);
      expect(soft).to.equal(true);
    });

    it("flags soft=false when size >= 10000", async function () {
      await mockPassport.setGroup(9, 12_000, true);
      const [size, hardOk, soft] = await gate.inspect(await mockPassport.getAddress(), 9, 1000);
      expect(size).to.equal(12_000n);
      expect(hardOk).to.equal(true);
      expect(soft).to.equal(false);
    });

    it("freshness inspector mirrors the registry leafCount", async function () {
      await mockRegistry.set(99, 750);
      const [size, hardOk, soft] = await gate.inspectFreshness(
        await mockRegistry.getAddress(),
        99,
        500,
      );
      expect(size).to.equal(750n);
      expect(hardOk).to.equal(true);
      expect(soft).to.equal(true);
    });
  });
});
