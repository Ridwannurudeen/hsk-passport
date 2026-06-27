import { expect } from "chai";
import { ethers } from "hardhat";
import { Identity } from "@semaphore-protocol/identity";

describe("CredentialReputation", () => {
  async function setup() {
    const [owner] = await ethers.getSigners();

    const PoseidonT3 = await ethers.getContractFactory("PoseidonT3");
    const poseidon = await PoseidonT3.deploy();
    await poseidon.waitForDeployment();

    const SemaphoreVerifier = await ethers.getContractFactory("SemaphoreVerifier");
    const verifier = await SemaphoreVerifier.deploy();
    await verifier.waitForDeployment();

    const Semaphore = await ethers.getContractFactory("Semaphore", {
      libraries: { PoseidonT3: await poseidon.getAddress() },
    });
    const semaphore = await Semaphore.deploy(await verifier.getAddress());
    await semaphore.waitForDeployment();

    const Passport = await ethers.getContractFactory("HSKPassport");
    const passport = await Passport.deploy(await semaphore.getAddress());
    await passport.waitForDeployment();

    const tx = await passport.createCredentialGroup("KYC", ethers.ZeroHash);
    const rc = await tx.wait();
    const ev = rc!.logs.find((l: any) => l.fragment?.name === "CredentialGroupCreated") as any;
    const groupId = Number(ev.args.groupId);

    const Reputation = await ethers.getContractFactory("CredentialReputation");
    const reputation = await Reputation.deploy(await passport.getAddress());
    await reputation.waitForDeployment();

    return { owner, passport, reputation, groupId };
  }

  it("rejects reputation issuance for a credential passport does not hold", async () => {
    const { reputation, groupId } = await setup();
    const identity = new Identity("missing-reputation-credential");

    await reputation.setPointsPerGroup(groupId, 10);

    await expect(
      reputation.recordIssuance(identity.commitment, groupId)
    ).to.be.revertedWithCustomError(reputation, "CredentialNotFound");
  });

  it("burns the awarded amount, not the current group configuration", async () => {
    const { passport, reputation, groupId } = await setup();
    const identity = new Identity("reputation-awarded-amount");

    await passport.issueCredential(groupId, identity.commitment);
    await reputation.setPointsPerGroup(groupId, 10);
    await reputation.recordIssuance(identity.commitment, groupId);

    expect(await reputation.reputationOf(identity.commitment)).to.equal(10n);
    expect(await reputation.awarded(identity.commitment, groupId)).to.equal(true);
    expect(await reputation.awardedPoints(identity.commitment, groupId)).to.equal(10n);

    await reputation.setPointsPerGroup(groupId, 100);

    await expect(reputation.recordRevocation(identity.commitment, groupId))
      .to.emit(reputation, "ReputationBurned")
      .withArgs(identity.commitment, 10n, 0n);
    expect(await reputation.reputationOf(identity.commitment)).to.equal(0n);
    expect(await reputation.awarded(identity.commitment, groupId)).to.equal(false);
    expect(await reputation.awardedPoints(identity.commitment, groupId)).to.equal(0n);
  });
});
