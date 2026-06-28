import { expect } from "chai";
import { ethers } from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

describe("HSK Passport Protocol", function () {
  let semaphore: any;
  let passport: any;
  let registry: any;
  let demoIssuer: any;
  let gatedRWA: any;
  let owner: any;
  let user1: any;
  let user2: any;

  const KYC_GROUP = 0; // first group created will be 0

  before(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy Semaphore stack
    const SemaphoreVerifier = await ethers.getContractFactory("SemaphoreVerifier");
    const verifier = await SemaphoreVerifier.deploy();

    const PoseidonT3 = await ethers.getContractFactory("PoseidonT3");
    const poseidon = await PoseidonT3.deploy();

    const Semaphore = await ethers.getContractFactory("Semaphore", {
      libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": await poseidon.getAddress() },
    });
    semaphore = await Semaphore.deploy(await verifier.getAddress());

    // Deploy CredentialRegistry
    const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
    registry = await CredentialRegistry.deploy();

    // Deploy HSKPassport
    const HSKPassport = await ethers.getContractFactory("HSKPassport");
    passport = await HSKPassport.deploy(await semaphore.getAddress());
  });

  describe("CredentialRegistry", function () {
    const schemaHash = ethers.keccak256(ethers.toUtf8Bytes("KYCVerified-v1"));

    it("should register a schema", async function () {
      await registry.registerSchema(schemaHash, "https://example.com/kyc.json", true);
      const schema = await registry.schemas(schemaHash);
      expect(schema.active).to.be.true;
      expect(schema.revocable).to.be.true;
      expect(schema.issuer).to.equal(owner.address);
    });

    it("should reject duplicate schema", async function () {
      await expect(
        registry.registerSchema(schemaHash, "https://example.com/kyc.json", true)
      ).to.be.revertedWithCustomError(registry, "SchemaAlreadyExists");
    });

    it("should revoke a credential", async function () {
      await registry.revokeCredential(schemaHash, 12345);
      expect(await registry.isRevoked(schemaHash, 12345)).to.be.true;
    });

    it("should reject revocation from non-issuer", async function () {
      await expect(
        registry.connect(user1).revokeCredential(schemaHash, 99999)
      ).to.be.revertedWithCustomError(registry, "NotSchemaIssuer");
    });

    it("should reject unapproved issuer", async function () {
      const otherHash = ethers.keccak256(ethers.toUtf8Bytes("Other-v1"));
      await expect(
        registry.connect(user1).registerSchema(otherHash, "https://example.com", false)
      ).to.be.revertedWithCustomError(registry, "NotApprovedIssuer");
    });
  });

  describe("HSKPassport — Group Management", function () {
    it("should create a credential group", async function () {
      await passport.createCredentialGroup("KYC_VERIFIED", ethers.ZeroHash);
      const group = await passport.credentialGroups(KYC_GROUP);
      expect(group.name).to.equal("KYC_VERIFIED");
      expect(group.active).to.be.true;
      expect(group.issuer).to.equal(owner.address);
    });

    it("should track group count", async function () {
      expect(await passport.getGroupCount()).to.equal(1);
    });

    it("should reject non-issuer group creation", async function () {
      await expect(
        passport.connect(user1).createCredentialGroup("INVALID", ethers.ZeroHash)
      ).to.be.revertedWithCustomError(passport, "NotApprovedIssuer");
    });
  });

  describe("HSKPassport — Credential Issuance", function () {
    const identity1 = new Identity("test-user-1");
    const identity2 = new Identity("test-user-2");

    it("should issue a credential", async function () {
      await passport.issueCredential(KYC_GROUP, identity1.commitment);
      expect(await passport.hasCredential(KYC_GROUP, identity1.commitment)).to.be.true;
    });

    it("should reject duplicate issuance", async function () {
      await expect(
        passport.issueCredential(KYC_GROUP, identity1.commitment)
      ).to.be.revertedWithCustomError(passport, "CredentialAlreadyIssued");
    });

    it("should reject issuance from non-issuer", async function () {
      await expect(
        passport.connect(user1).issueCredential(KYC_GROUP, identity2.commitment)
      ).to.be.revertedWithCustomError(passport, "NotGroupIssuerOrDelegate");
    });

    it("should batch issue credentials", async function () {
      const ids = [new Identity("batch-1"), new Identity("batch-2"), new Identity("batch-3")];
      const commitments = ids.map((i) => i.commitment);
      await passport.batchIssueCredentials(KYC_GROUP, commitments);
      for (const c of commitments) {
        expect(await passport.hasCredential(KYC_GROUP, c)).to.be.true;
      }
    });
  });

  describe("HSKPassport — Delegate System", function () {
    it("should approve a delegate for a specific group", async function () {
      await passport.approveDelegate(KYC_GROUP, user1.address);
      expect(await passport.groupDelegates(KYC_GROUP, user1.address)).to.be.true;
    });

    it("should allow delegate to issue credentials on approved group", async function () {
      const id = new Identity("delegate-test");
      await passport.connect(user1).issueCredential(KYC_GROUP, id.commitment);
      expect(await passport.hasCredential(KYC_GROUP, id.commitment)).to.be.true;
    });

    it("should revoke delegate access for a group", async function () {
      await passport.revokeDelegate(KYC_GROUP, user1.address);
      const id = new Identity("delegate-revoked");
      await expect(
        passport.connect(user1).issueCredential(KYC_GROUP, id.commitment)
      ).to.be.revertedWithCustomError(passport, "NotGroupIssuerOrDelegate");
    });
  });

  describe("HSKPassport — ZK Proof Verification", function () {
    const testIdentity = new Identity("zk-test-user");

    before(async function () {
      // Issue credential for test identity
      const hasCred = await passport.hasCredential(KYC_GROUP, testIdentity.commitment);
      if (!hasCred) {
        await passport.issueCredential(KYC_GROUP, testIdentity.commitment);
      }
    });

    it("should verify a valid ZK proof", async function () {
      this.timeout(120000); // proof gen can be slow

      // Build group from all issued members
      const filter = passport.filters.CredentialIssued(KYC_GROUP);
      const events = await passport.queryFilter(filter);
      const members = events.map((e: any) => {
        const parsed = passport.interface.parseLog({ topics: [...e.topics], data: e.data });
        return parsed?.args?.identityCommitment;
      }).filter(Boolean);

      const group = new Group();
      for (const m of members) group.addMember(m);

      const proof = await generateProof(testIdentity, group, 1, KYC_GROUP);

      const valid = await semaphore.verifyProof(KYC_GROUP, {
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot: proof.merkleTreeRoot,
        nullifier: proof.nullifier,
        message: proof.message,
        scope: proof.scope,
        points: proof.points,
      });

      expect(valid).to.be.true;
    });

    it("should verify via HSKPassport.verifyCredential", async function () {
      this.timeout(120000);

      const filter = passport.filters.CredentialIssued(KYC_GROUP);
      const events = await passport.queryFilter(filter);
      const members = events.map((e: any) => {
        const parsed = passport.interface.parseLog({ topics: [...e.topics], data: e.data });
        return parsed?.args?.identityCommitment;
      }).filter(Boolean);

      const group = new Group();
      for (const m of members) group.addMember(m);

      const proof = await generateProof(testIdentity, group, 1, KYC_GROUP);

      const valid = await passport.verifyCredential(KYC_GROUP, {
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot: proof.merkleTreeRoot,
        nullifier: proof.nullifier,
        message: proof.message,
        scope: proof.scope,
        points: proof.points,
      });

      expect(valid).to.be.true;
    });
  });

  describe("DemoIssuer", function () {
    const demoIdentity = new Identity("demo-user");

    before(async function () {
      const DemoIssuer = await ethers.getContractFactory("DemoIssuer");
      demoIssuer = await DemoIssuer.deploy(await passport.getAddress(), KYC_GROUP);

      // Approve DemoIssuer as delegate for KYC_GROUP
      await passport.approveDelegate(KYC_GROUP, await demoIssuer.getAddress());
    });

    it("should self-issue a credential", async function () {
      await demoIssuer.connect(user2).selfIssue(demoIdentity.commitment);
      expect(await passport.hasCredential(KYC_GROUP, demoIdentity.commitment)).to.be.true;
      expect(await demoIssuer.hasClaimed(user2.address)).to.be.true;
    });

    it("should reject double claim", async function () {
      await expect(
        demoIssuer.connect(user2).selfIssue(demoIdentity.commitment)
      ).to.be.revertedWithCustomError(demoIssuer, "AlreadyClaimed");
    });

    it("should track total issued", async function () {
      expect(await demoIssuer.totalIssued()).to.equal(1);
    });
  });

  describe("GatedRWA — Caller-Bound Proof Mint", function () {
    const mintIdentity = new Identity("gated-rwa-minter");

    before(async function () {
      const GatedRWA = await ethers.getContractFactory("GatedRWA");
      gatedRWA = await GatedRWA.deploy(
        await semaphore.getAddress(),
        KYC_GROUP,
        ethers.parseEther("100")
      );

      // Issue credential if not already
      const hasCred = await passport.hasCredential(KYC_GROUP, mintIdentity.commitment);
      if (!hasCred) {
        await passport.issueCredential(KYC_GROUP, mintIdentity.commitment);
      }
    });

    it("should have correct config", async function () {
      expect(await gatedRWA.name()).to.equal("HashKey Silver Token");
      expect(await gatedRWA.symbol()).to.equal("hSILVER");
      expect(await gatedRWA.requiredGroupId()).to.equal(KYC_GROUP);
    });

    it("should mint with caller-bound proof", async function () {
      this.timeout(120000);

      const filter = passport.filters.CredentialIssued(KYC_GROUP);
      const events = await passport.queryFilter(filter);
      const members = events.map((e: any) => {
        const parsed = passport.interface.parseLog({ topics: [...e.topics], data: e.data });
        return parsed?.args?.identityCommitment;
      }).filter(Boolean);

      const group = new Group();
      for (const m of members) group.addMember(m);

      // Bind proof to owner's address
      const callerAddr = BigInt(owner.address);
      const proof = await generateProof(mintIdentity, group, callerAddr, BigInt(await gatedRWA.getAddress()));

      await gatedRWA.kycMint({
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot: proof.merkleTreeRoot,
        nullifier: proof.nullifier,
        message: proof.message,
        scope: proof.scope,
        points: proof.points,
      });

      expect(await gatedRWA.balanceOf(owner.address)).to.equal(ethers.parseEther("100"));
      expect(await gatedRWA.totalSupply()).to.equal(ethers.parseEther("100"));
    });

    it("should reject proof bound to different address", async function () {
      this.timeout(120000);

      const filter = passport.filters.CredentialIssued(KYC_GROUP);
      const events = await passport.queryFilter(filter);
      const members = events.map((e: any) => {
        const parsed = passport.interface.parseLog({ topics: [...e.topics], data: e.data });
        return parsed?.args?.identityCommitment;
      }).filter(Boolean);

      const group = new Group();
      for (const m of members) group.addMember(m);

      // Proof bound to user1's address, but submitted by user2
      const proof = await generateProof(mintIdentity, group, BigInt(user1.address), 100);

      await expect(
        gatedRWA.connect(user2).kycMint({
          merkleTreeDepth: proof.merkleTreeDepth,
          merkleTreeRoot: proof.merkleTreeRoot,
          nullifier: proof.nullifier,
          message: proof.message,
          scope: proof.scope,
          points: proof.points,
        })
      ).to.be.revertedWithCustomError(gatedRWA, "ProofNotBoundToCaller");
    });

    it("should reject reused nullifier", async function () {
      this.timeout(120000);

      const filter = passport.filters.CredentialIssued(KYC_GROUP);
      const events = await passport.queryFilter(filter);
      const members = events.map((e: any) => {
        const parsed = passport.interface.parseLog({ topics: [...e.topics], data: e.data });
        return parsed?.args?.identityCommitment;
      }).filter(Boolean);

      const group = new Group();
      for (const m of members) group.addMember(m);

      // Same scope=99 as first successful mint → same nullifier
      const proof = await generateProof(mintIdentity, group, BigInt(owner.address), BigInt(await gatedRWA.getAddress()));

      await expect(
        gatedRWA.kycMint({
          merkleTreeDepth: proof.merkleTreeDepth,
          merkleTreeRoot: proof.merkleTreeRoot,
          nullifier: proof.nullifier,
          message: proof.message,
          scope: proof.scope,
          points: proof.points,
        })
      ).to.be.revertedWithCustomError(gatedRWA, "NullifierAlreadyUsed");
    });
  });

  describe("Per-Group Delegate Isolation", function () {
    let secondGroup: number;

    before(async function () {
      const tx = await passport.createCredentialGroup("SECOND_GROUP", ethers.ZeroHash);
      const receipt = await tx.wait();
      // Group counter increments
      secondGroup = Number(await passport.getGroupCount()) - 1;
    });

    it("should allow delegate on approved group only", async function () {
      // Approve user1 as delegate for KYC_GROUP only
      await passport.approveDelegate(KYC_GROUP, user1.address);
      expect(await passport.groupDelegates(KYC_GROUP, user1.address)).to.be.true;

      // user1 can issue on KYC_GROUP
      const id = new Identity("per-group-delegate-test");
      await passport.connect(user1).issueCredential(KYC_GROUP, id.commitment);
      expect(await passport.hasCredential(KYC_GROUP, id.commitment)).to.be.true;
    });

    it("should reject delegate on non-approved group", async function () {
      // user1 is NOT delegate for secondGroup
      expect(await passport.groupDelegates(secondGroup, user1.address)).to.be.false;

      const id = new Identity("isolation-test");
      await expect(
        passport.connect(user1).issueCredential(secondGroup, id.commitment)
      ).to.be.revertedWithCustomError(passport, "NotGroupIssuerOrDelegate");
    });
  });

  describe("HSKPassport — Audit Revocation Controls", function () {
    let p: any;
    let groupId: number;
    let issuer: any;
    let delegate: any;
    let other: any;

    beforeEach(async function () {
      [owner, issuer, delegate, other] = await ethers.getSigners();
      const HSKPassport = await ethers.getContractFactory("HSKPassport");
      p = await HSKPassport.connect(owner).deploy(await semaphore.getAddress());
      await p.connect(owner).approveIssuer(issuer.address);
      const tx = await p.connect(issuer).createCredentialGroup("Issuer Group", ethers.ZeroHash);
      const rc = await tx.wait();
      const ev = rc.logs.find((l: any) => l.fragment?.name === "CredentialGroupCreated");
      groupId = Number(ev.args.groupId);
    });

    it("owner can revoke a credential after the group issuer is revoked", async function () {
      const id = new Identity("owner-revoke-after-issuer-revoked");
      await p.connect(issuer).issueCredential(groupId, id.commitment);
      await p.connect(owner).revokeIssuer(issuer.address);

      await expect(p.connect(owner).revokeCredential(groupId, id.commitment, []))
        .to.emit(p, "CredentialRevoked")
        .withArgs(groupId, id.commitment);
      expect(await p.hasCredential(groupId, id.commitment)).to.equal(false);
    });

    it("rejects credential revocation from a random address", async function () {
      const id = new Identity("random-address-revoke-rejected");
      await p.connect(issuer).issueCredential(groupId, id.commitment);

      await expect(
        p.connect(other).revokeCredential(groupId, id.commitment, [])
      ).to.be.revertedWithCustomError(p, "NotGroupIssuerOrDelegate");
    });

    it("rejects credential revocation from a delegate after the issuer is revoked", async function () {
      const id = new Identity("revoked-issuer-delegate-revoke-rejected");
      await p.connect(issuer).issueCredential(groupId, id.commitment);
      await p.connect(issuer).approveDelegate(groupId, delegate.address);
      expect(await p.groupDelegates(groupId, delegate.address)).to.equal(true);

      await p.connect(owner).revokeIssuer(issuer.address);

      await expect(
        p.connect(delegate).revokeCredential(groupId, id.commitment, [])
      ).to.be.revertedWithCustomError(p, "NotApprovedIssuer");
    });

    it("rejects a group A delegate revoking credentials in group B", async function () {
      await p.connect(issuer).approveDelegate(groupId, delegate.address);
      const tx = await p.connect(issuer).createCredentialGroup("Issuer Group B", ethers.ZeroHash);
      const rc = await tx.wait();
      const ev = rc.logs.find((l: any) => l.fragment?.name === "CredentialGroupCreated");
      const secondGroupId = Number(ev.args.groupId);
      const id = new Identity("group-b-revoke-isolation");
      await p.connect(issuer).issueCredential(secondGroupId, id.commitment);

      await expect(
        p.connect(delegate).revokeCredential(secondGroupId, id.commitment, [])
      ).to.be.revertedWithCustomError(p, "NotGroupIssuerOrDelegate");
    });

    it("invalidates stale delegates across revoke and re-approve until the issuer re-approves them", async function () {
      await p.connect(issuer).approveDelegate(groupId, delegate.address);
      expect(await p.groupDelegateEpoch(groupId, delegate.address)).to.equal(0n);

      const first = new Identity("epoch-delegate-before-revoke");
      await expect(p.connect(delegate).issueCredential(groupId, first.commitment))
        .to.emit(p, "CredentialIssued")
        .withArgs(groupId, first.commitment);

      await p.connect(owner).revokeIssuer(issuer.address);
      expect(await p.issuerEpoch(issuer.address)).to.equal(1n);
      expect(await p.groupDelegates(groupId, delegate.address)).to.equal(true);
      await p.connect(owner).approveIssuer(issuer.address);

      const stale = new Identity("epoch-stale-delegate");
      await expect(
        p.connect(delegate).issueCredential(groupId, stale.commitment)
      ).to.be.revertedWithCustomError(p, "NotGroupIssuerOrDelegate");

      await p.connect(issuer).approveDelegate(groupId, delegate.address);
      expect(await p.groupDelegateEpoch(groupId, delegate.address)).to.equal(1n);
      const current = new Identity("epoch-current-delegate");
      await expect(p.connect(delegate).issueCredential(groupId, current.commitment))
        .to.emit(p, "CredentialIssued")
        .withArgs(groupId, current.commitment);
    });

    it("deactivates a group without clearing delegates because inactive groups cannot issue", async function () {
      await p.connect(issuer).approveDelegate(groupId, delegate.address);

      await p.connect(owner).deactivateGroup(groupId);
      expect(await p.groupDelegates(groupId, delegate.address)).to.equal(true);

      const id = new Identity("inactive-group-delegate");
      await expect(
        p.connect(delegate).issueCredential(groupId, id.commitment)
      ).to.be.revertedWithCustomError(p, "GroupNotActive");
    });

    it("keeps issuer revocation bounded after many groups and delegates exist", async function () {
      this.timeout(120000);
      const signers = await ethers.getSigners();
      const delegates = signers.slice(3, 9).map((s: any) => s.address);

      for (let i = 0; i < 16; i++) {
        const tx = await p.connect(issuer).createCredentialGroup(`Spam Group ${i}`, ethers.ZeroHash);
        const rc = await tx.wait();
        const ev = rc.logs.find((l: any) => l.fragment?.name === "CredentialGroupCreated");
        const spamGroupId = Number(ev.args.groupId);

        for (const delegateAddress of delegates) {
          await p.connect(issuer).approveDelegate(spamGroupId, delegateAddress);
        }
      }

      const tx = await p.connect(owner).revokeIssuer(issuer.address);
      await expect(tx).to.emit(p, "IssuerRevoked").withArgs(issuer.address);
      const rc = await tx.wait();
      expect(rc.gasUsed < 100000n).to.equal(true);
    });
  });

  describe("HSKPassport — Pause Logic", function () {
    let p: any;
    let groupId: number;
    let pauser: any;
    let other: any;

    beforeEach(async function () {
      [owner, pauser, other, user1, user2] = await ethers.getSigners();
      const HSKPassport = await ethers.getContractFactory("HSKPassport");
      p = await HSKPassport.connect(owner).deploy(await semaphore.getAddress());
      const tx = await p.createCredentialGroup("Pause Test", ethers.ZeroHash);
      const rc = await tx.wait();
      const ev = rc.logs.find((l: any) => l.fragment?.name === "CredentialGroupCreated");
      groupId = Number(ev.args.groupId);
    });

    it("constructor sets pauser to deployer", async function () {
      expect(await p.pauser()).to.equal(owner.address);
      expect(await p.paused()).to.equal(false);
    });

    it("setPauser is owner-only and emits event", async function () {
      await expect(p.connect(other).setPauser(pauser.address))
        .to.be.revertedWithCustomError(p, "NotOwner");
      await expect(p.connect(owner).setPauser(pauser.address))
        .to.emit(p, "PauserSet").withArgs(owner.address, pauser.address);
      expect(await p.pauser()).to.equal(pauser.address);
    });

    it("pause is pauser-only", async function () {
      await p.connect(owner).setPauser(pauser.address);
      await expect(p.connect(other).pause()).to.be.revertedWithCustomError(p, "NotPauser");
      await expect(p.connect(owner).pause()).to.be.revertedWithCustomError(p, "NotPauser");
      await expect(p.connect(pauser).pause()).to.emit(p, "Paused");
      expect(await p.paused()).to.equal(true);
    });

    it("pause reverts if already paused", async function () {
      await p.connect(owner).pause();
      await expect(p.connect(owner).pause()).to.be.revertedWithCustomError(p, "AlreadyPaused");
    });

    it("unpause is owner-only (asymmetric — pauser cannot unpause)", async function () {
      await p.connect(owner).setPauser(pauser.address);
      await p.connect(pauser).pause();
      await expect(p.connect(pauser).unpause()).to.be.revertedWithCustomError(p, "NotOwner");
      await expect(p.connect(other).unpause()).to.be.revertedWithCustomError(p, "NotOwner");
      await expect(p.connect(owner).unpause()).to.emit(p, "Unpaused");
      expect(await p.paused()).to.equal(false);
    });

    it("unpause reverts if not paused", async function () {
      await expect(p.connect(owner).unpause()).to.be.revertedWithCustomError(p, "NotPausedError");
    });

    it("global pause blocks issueCredential", async function () {
      await p.connect(owner).pause();
      const id = new Identity("paused-test");
      await expect(p.issueCredential(groupId, id.commitment))
        .to.be.revertedWithCustomError(p, "PausedGlobally");
    });

    it("global pause blocks batchIssueCredentials", async function () {
      await p.connect(owner).pause();
      const id1 = new Identity("paused-batch-1");
      const id2 = new Identity("paused-batch-2");
      await expect(p.batchIssueCredentials(groupId, [id1.commitment, id2.commitment]))
        .to.be.revertedWithCustomError(p, "PausedGlobally");
    });

    it("global pause blocks createCredentialGroup", async function () {
      await p.connect(owner).pause();
      await expect(p.createCredentialGroup("Blocked", ethers.ZeroHash))
        .to.be.revertedWithCustomError(p, "PausedGlobally");
    });

    it("global pause blocks approveDelegate", async function () {
      await p.connect(owner).pause();
      await expect(p.approveDelegate(groupId, user1.address))
        .to.be.revertedWithCustomError(p, "PausedGlobally");
    });

    it("global pause does NOT block revokeCredential", async function () {
      const id = new Identity("revoke-during-pause");
      await p.issueCredential(groupId, id.commitment);
      await p.connect(owner).pause();
      const group = new Group();
      group.addMember(id.commitment);
      await expect(p.revokeCredential(groupId, id.commitment, [])).to.not.be.reverted;
    });

    it("global pause does NOT block governance (approveIssuer, transferOwnership)", async function () {
      await p.connect(owner).pause();
      await expect(p.connect(owner).approveIssuer(other.address)).to.not.be.reverted;
      await expect(p.connect(owner).transferOwnership(other.address)).to.not.be.reverted;
    });

    it("after unpause, issuance works again", async function () {
      await p.connect(owner).pause();
      await p.connect(owner).unpause();
      const id = new Identity("post-unpause");
      await expect(p.issueCredential(groupId, id.commitment))
        .to.emit(p, "CredentialIssued");
    });

    it("pauseIssuer is pauser-only and surgical (doesn't affect other issuers)", async function () {
      await p.connect(owner).approveIssuer(other.address);
      const otherGroupTx = await p.connect(other).createCredentialGroup("Other Group", ethers.ZeroHash);
      const otherRc = await otherGroupTx.wait();
      const otherEv = otherRc.logs.find((l: any) => l.fragment?.name === "CredentialGroupCreated");
      const otherGroupId = Number(otherEv.args.groupId);

      await expect(p.connect(user1).pauseIssuer(owner.address))
        .to.be.revertedWithCustomError(p, "NotPauser");
      await expect(p.connect(owner).pauseIssuer(owner.address)).to.emit(p, "IssuerPaused");
      expect(await p.issuerPaused(owner.address)).to.equal(true);

      const id = new Identity("paused-issuer-test");
      await expect(p.issueCredential(groupId, id.commitment))
        .to.be.revertedWithCustomError(p, "IssuerIsPaused");

      const id2 = new Identity("other-issuer-still-works");
      await expect(p.connect(other).issueCredential(otherGroupId, id2.commitment))
        .to.emit(p, "CredentialIssued");
    });

    it("unpauseIssuer is owner-only (asymmetric)", async function () {
      await p.connect(owner).setPauser(pauser.address);
      await p.connect(pauser).pauseIssuer(owner.address);
      await expect(p.connect(pauser).unpauseIssuer(owner.address))
        .to.be.revertedWithCustomError(p, "NotOwner");
      await expect(p.connect(owner).unpauseIssuer(owner.address))
        .to.emit(p, "IssuerUnpaused");
      expect(await p.issuerPaused(owner.address)).to.equal(false);
    });
  });
});
