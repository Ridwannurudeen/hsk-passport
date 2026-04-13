import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import { generateProof } from "@semaphore-protocol/proof";

describe("HSKPassport — credential expiry", () => {
  async function setup() {
    const [owner, issuer, user] = await ethers.getSigners();

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

    await passport.connect(owner).approveIssuer(issuer.address);
    const tx = await passport.connect(issuer).createCredentialGroup("KYC", ethers.ZeroHash);
    const rc = await tx.wait();
    const ev = rc!.logs.find((l: any) => l.fragment?.name === "CredentialGroupCreated") as any;
    const groupId = Number(ev.args.groupId);

    return { owner, issuer, user, passport, semaphore, groupId };
  }

  it("defaults to no expiry on new groups", async () => {
    const { passport, groupId } = await setup();
    const g = await passport.credentialGroups(groupId);
    expect(g.validityPeriod).to.equal(0n);
  });

  it("only the group issuer can set validityPeriod", async () => {
    const { passport, user, groupId } = await setup();
    await expect(passport.connect(user).setValidityPeriod(groupId, 3600))
      .to.be.reverted;
  });

  it("records issuedAt on issueCredential", async () => {
    const { passport, issuer, groupId } = await setup();
    const identity = new Identity();
    const t0 = await time.latest();
    await passport.connect(issuer).issueCredential(groupId, identity.commitment);
    const ts = await passport.credentialIssuedAt(groupId, identity.commitment);
    expect(Number(ts)).to.be.gte(t0);
  });

  it("isCredentialExpired returns false before validity elapses, true after", async () => {
    const { passport, issuer, groupId } = await setup();
    const identity = new Identity();
    await passport.connect(issuer).setValidityPeriod(groupId, 3600); // 1 hour
    await passport.connect(issuer).issueCredential(groupId, identity.commitment);

    expect(await passport.isCredentialExpired(groupId, identity.commitment)).to.be.false;

    await time.increase(3601);
    expect(await passport.isCredentialExpired(groupId, identity.commitment)).to.be.true;
  });

  it("verifyCredentialWithExpiry reverts when proof is older than validity window", async () => {
    const { passport, issuer, groupId } = await setup();
    const identity = new Identity();
    await passport.connect(issuer).setValidityPeriod(groupId, 3600);
    await passport.connect(issuer).issueCredential(groupId, identity.commitment);

    const group = new Group();
    group.addMember(identity.commitment);
    const proof = await generateProof(identity, group, 1n, 1n);

    // Within window — passes
    const earliestNow = await time.latest();
    expect(await passport.verifyCredentialWithExpiry(groupId, proof, earliestNow)).to.be.true;

    // After window — verifier passes a stale `earliestAcceptableIssuance`
    await time.increase(3601);
    await expect(
      passport.verifyCredentialWithExpiry(groupId, proof, earliestNow)
    ).to.be.revertedWithCustomError(passport, "CredentialExpired");
  });

  it("verifyCredential (no-expiry variant) still works regardless of expiry state", async () => {
    const { passport, issuer, groupId } = await setup();
    const identity = new Identity();
    await passport.connect(issuer).setValidityPeriod(groupId, 3600);
    await passport.connect(issuer).issueCredential(groupId, identity.commitment);

    const group = new Group();
    group.addMember(identity.commitment);
    const proof = await generateProof(identity, group, 1n, 1n);

    await time.increase(99999);
    // Legacy verifyCredential ignores expiry (backward compat for existing dApps)
    expect(await passport.verifyCredential(groupId, proof)).to.be.true;
  });
});
