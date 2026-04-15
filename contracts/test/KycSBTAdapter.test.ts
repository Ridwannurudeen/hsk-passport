import { expect } from "chai";
import { ethers } from "hardhat";

// Enum matches IKycSBT from HashKey docs
enum KycLevel { NONE, BASIC, ADVANCED, PREMIUM, ULTIMATE }

describe("HashKeyKycSBTAdapter — official IKycSBT bridge", () => {
  async function setup() {
    const [owner, alice, bob, carol, dave, eve] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockKycSBT");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();

    const Adapter = await ethers.getContractFactory("HashKeyKycSBTAdapter");
    const adapter = await Adapter.deploy(await mock.getAddress());
    await adapter.waitForDeployment();

    return { owner, alice, bob, carol, dave, eve, mock, adapter };
  }

  async function approveAt(mock: any, owner: any, user: any, level: KycLevel) {
    await mock.connect(user).requestKyc(`${user.address.slice(2, 10)}.key`);
    await mock.connect(owner).approve(user.address, level);
  }

  it("returns false / level 0 for an address that never requested KYC", async () => {
    const { adapter, alice } = await setup();
    expect(await adapter.hasKYC(alice.address)).to.be.false;
    expect(await adapter.kycLevelOf(alice.address)).to.equal(0);
  });

  it("returns false for a requested-but-not-approved address", async () => {
    const { mock, adapter, alice } = await setup();
    await mock.connect(alice).requestKyc("alice.key");
    expect(await adapter.hasKYC(alice.address)).to.be.false;
    expect(await adapter.kycLevelOf(alice.address)).to.equal(0);
  });

  it("maps BASIC (1) → level 1", async () => {
    const { mock, owner, adapter, alice } = await setup();
    await approveAt(mock, owner, alice, KycLevel.BASIC);
    expect(await adapter.hasKYC(alice.address)).to.be.true;
    expect(await adapter.kycLevelOf(alice.address)).to.equal(1);
  });

  it("maps ADVANCED (2) → level 2", async () => {
    const { mock, owner, adapter, bob } = await setup();
    await approveAt(mock, owner, bob, KycLevel.ADVANCED);
    expect(await adapter.hasKYC(bob.address)).to.be.true;
    expect(await adapter.kycLevelOf(bob.address)).to.equal(2);
  });

  it("maps PREMIUM (3) → level 3", async () => {
    const { mock, owner, adapter, carol } = await setup();
    await approveAt(mock, owner, carol, KycLevel.PREMIUM);
    expect(await adapter.hasKYC(carol.address)).to.be.true;
    expect(await adapter.kycLevelOf(carol.address)).to.equal(3);
  });

  it("maps ULTIMATE (4) → level 3 (treated as PREMIUM-equivalent)", async () => {
    const { mock, owner, adapter, dave } = await setup();
    await approveAt(mock, owner, dave, KycLevel.ULTIMATE);
    expect(await adapter.hasKYC(dave.address)).to.be.true;
    expect(await adapter.kycLevelOf(dave.address)).to.equal(3);
  });

  it("flips hasKYC back to false and level to 0 on revoke", async () => {
    const { mock, owner, adapter, eve } = await setup();
    await approveAt(mock, owner, eve, KycLevel.ADVANCED);
    expect(await adapter.hasKYC(eve.address)).to.be.true;

    await mock.connect(owner).revokeKyc(eve.address);
    expect(await adapter.hasKYC(eve.address)).to.be.false;
    expect(await adapter.kycLevelOf(eve.address)).to.equal(0);
  });

  it("restores hasKYC and preserves the pre-revoke level on restore", async () => {
    const { mock, owner, adapter, eve } = await setup();
    await approveAt(mock, owner, eve, KycLevel.PREMIUM);
    await mock.connect(owner).revokeKyc(eve.address);
    await mock.connect(owner).restoreKyc(eve.address);
    expect(await adapter.hasKYC(eve.address)).to.be.true;
    expect(await adapter.kycLevelOf(eve.address)).to.equal(3);
  });
});

describe("End-to-end: IKycSBT → Adapter → HashKeyKYCImporter → HSK Passport credential", () => {
  it("a PREMIUM-tier KYC'd user imports KYC_VERIFIED + ACCREDITED_INVESTOR credentials", async () => {
    const [owner, user] = await ethers.getSigners();

    // 1. Deploy Semaphore v4 + HSKPassport
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

    // 2. Create the three groups the importer will populate
    const mkGroup = async (name: string) => {
      const tx = await passport.createCredentialGroup(name, ethers.ZeroHash);
      const rc = await tx.wait();
      const ev = rc!.logs.find((l: any) => l.fragment?.name === "CredentialGroupCreated") as any;
      return Number(ev.args.groupId);
    };
    const kycGroup = await mkGroup("KYC_VERIFIED");
    const accGroup = await mkGroup("ACCREDITED_INVESTOR");
    const hkGroup = await mkGroup("HK_RESIDENT");

    // 3. Deploy the real chain: MockKycSBT (official IKycSBT shape) → Adapter → Importer
    const Mock = await ethers.getContractFactory("MockKycSBT");
    const kycSbt = await Mock.deploy();
    await kycSbt.waitForDeployment();

    const Adapter = await ethers.getContractFactory("HashKeyKycSBTAdapter");
    const adapter = await Adapter.deploy(await kycSbt.getAddress());
    await adapter.waitForDeployment();

    const Importer = await ethers.getContractFactory("HashKeyKYCImporter");
    const importer = await Importer.deploy(
      await passport.getAddress(),
      kycGroup,
      accGroup,
      hkGroup
    );
    await importer.waitForDeployment();
    // Wire the importer to read through the adapter
    await (importer as any).setKYCSbt(await adapter.getAddress());

    // 4. Approve the importer as a delegate on the groups it issues into
    for (const g of [kycGroup, accGroup]) {
      await passport.approveDelegate(g, await importer.getAddress());
    }

    // 5. User completes HashKey KYC at the PREMIUM tier
    await kycSbt.connect(user).requestKyc("user.key");
    await kycSbt.connect(owner).approve(user.address, KycLevel.PREMIUM);

    // 6. User imports into HSK Passport with their Semaphore commitment
    const commitment = 123456789n;
    await (importer as any).connect(user).importKYC(commitment);

    // 7. The appropriate credentials should now be present on-chain.
    //    PREMIUM (level 3) → KYC_VERIFIED + ACCREDITED_INVESTOR.
    //    Residency is a separate credential that needs its own bridge (e.g. HashKeyDIDBridge).
    expect(await passport.hasCredential(kycGroup, commitment)).to.be.true;
    expect(await passport.hasCredential(accGroup, commitment)).to.be.true;
  });

  it("rejects an import attempt from a user with no KYC", async () => {
    const [, notKycd] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockKycSBT");
    const kycSbt = await Mock.deploy();
    await kycSbt.waitForDeployment();

    const Adapter = await ethers.getContractFactory("HashKeyKycSBTAdapter");
    const adapter = await Adapter.deploy(await kycSbt.getAddress());
    await adapter.waitForDeployment();

    // Importer pointing at a placeholder passport (won't be reached)
    const Importer = await ethers.getContractFactory("HashKeyKYCImporter");
    const importer = await Importer.deploy(ethers.ZeroAddress, 1, 2, 3);
    await importer.waitForDeployment();
    await (importer as any).setKYCSbt(await adapter.getAddress());

    await expect(
      (importer as any).connect(notKycd).importKYC(42n)
    ).to.be.revertedWithCustomError(importer, "NoKYCSBT");
  });
});
