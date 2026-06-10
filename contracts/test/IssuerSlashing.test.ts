import { expect } from "chai";
import { ethers } from "hardhat";

describe("IssuerRegistry — slashing via Timelock authority", () => {
  async function setup() {
    const [owner, issuer, other, attacker, treasury] =
      await ethers.getSigners();

    const Registry = await ethers.getContractFactory("IssuerRegistry");
    const registry = await Registry.deploy(treasury.address);
    await registry.waitForDeployment();

    // Simulate governance-gated slashing by designating a separate authority.
    await registry.setSlashingAuthority(other.address);

    // Issuer stakes to become Community tier (min stake default 0 — add a nonzero stake for visibility)
    await registry
      .connect(issuer)
      .stakeAndRegister("ipfs://issuer", { value: ethers.parseEther("5") });

    return { owner, issuer, other, attacker, treasury, registry };
  }

  it("only the slashing authority can slash", async () => {
    const { registry, issuer, attacker } = await setup();
    await expect(
      registry
        .connect(attacker)
        .slash(issuer.address, ethers.parseEther("1"), "test"),
    ).to.be.revertedWithCustomError(registry, "NotSlashingAuthority");
  });

  it("slashes the specified amount and caps at available stake", async () => {
    const { registry, issuer, other } = await setup();

    await registry
      .connect(other)
      .slash(issuer.address, ethers.parseEther("2"), "misissuance");
    const info = await registry.issuers(issuer.address);
    expect(info.stake).to.equal(ethers.parseEther("3"));
    expect(info.slashedAmount).to.equal(ethers.parseEther("2"));

    // Slash more than remaining — caps at available
    await registry
      .connect(other)
      .slash(issuer.address, ethers.parseEther("10"), "more");
    const info2 = await registry.issuers(issuer.address);
    expect(info2.stake).to.equal(0n);
    expect(info2.slashedAmount).to.equal(ethers.parseEther("5"));
  });

  it("emits IssuerSlashed with reason and amount", async () => {
    const { registry, issuer, other } = await setup();
    await expect(
      registry
        .connect(other)
        .slash(issuer.address, ethers.parseEther("1"), "doc forgery"),
    )
      .to.emit(registry, "IssuerSlashed")
      .withArgs(issuer.address, ethers.parseEther("1"), "doc forgery");
  });

  it("sends slashed funds to the immutable treasury, not the owner", async () => {
    const { registry, issuer, other, treasury } = await setup();
    const before = await ethers.provider.getBalance(treasury.address);
    await registry
      .connect(other)
      .slash(issuer.address, ethers.parseEther("2"), "misissuance");
    const after = await ethers.provider.getBalance(treasury.address);
    expect(after - before).to.equal(ethers.parseEther("2"));
  });

  it("deactivates a fully slashed issuer", async () => {
    const { registry, issuer, other } = await setup();
    await registry
      .connect(other)
      .slash(issuer.address, ethers.parseEther("5"), "all");
    expect(await registry.isActiveIssuer(issuer.address)).to.equal(false);
  });

  it("only the reporter can write reputation", async () => {
    const { registry, issuer, attacker } = await setup();
    await expect(
      registry.connect(attacker).reportIssuance(issuer.address, 25),
    ).to.be.revertedWithCustomError(registry, "NotReporter");
  });
});
