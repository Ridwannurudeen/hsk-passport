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
      await passport["createCredentialGroup(string)"]("KYC_VERIFIED");
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
        passport.connect(user1)["createCredentialGroup(string)"]("INVALID")
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
    it("should approve a delegate", async function () {
      await passport.approveDelegate(user1.address);
      expect(await passport.approvedDelegates(user1.address)).to.be.true;
    });

    it("should allow delegate to issue credentials", async function () {
      const id = new Identity("delegate-test");
      await passport.connect(user1).issueCredential(KYC_GROUP, id.commitment);
      expect(await passport.hasCredential(KYC_GROUP, id.commitment)).to.be.true;
    });

    it("should revoke delegate access", async function () {
      await passport.revokeDelegate(user1.address);
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

      // Approve DemoIssuer as delegate
      await passport.approveDelegate(await demoIssuer.getAddress());
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

  describe("GatedRWA", function () {
    before(async function () {
      const GatedRWA = await ethers.getContractFactory("GatedRWA");
      gatedRWA = await GatedRWA.deploy(
        await semaphore.getAddress(),
        KYC_GROUP,
        ethers.parseEther("100")
      );
    });

    it("should have correct config", async function () {
      expect(await gatedRWA.name()).to.equal("HashKey Silver Token");
      expect(await gatedRWA.symbol()).to.equal("hSILVER");
      expect(await gatedRWA.requiredGroupId()).to.equal(KYC_GROUP);
    });
  });
});
