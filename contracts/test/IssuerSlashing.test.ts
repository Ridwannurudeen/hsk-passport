import { expect } from "chai";
import { ethers } from "hardhat";

describe("IssuerRegistry — slashing via Timelock authority", () => {
  async function setup() {
    const [owner, issuer, other, attacker] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("IssuerRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    // Simulate governance-gated slashing by designating a separate authority.
    await registry.setSlashingAuthority(other.address);

    // Issuer stakes to become Community tier (min stake default 0 — add a nonzero stake for visibility)
    await registry.connect(issuer).stakeAndRegister("ipfs://issuer", { value: ethers.parseEther("5") });

    return { owner, issuer, other, attacker, registry };
  }

  it("only the slashing authority can slash", async () => {
    const { registry, issuer, attacker } = await setup();
    await expect(
      registry.connect(attacker).slash(issuer.address, ethers.parseEther("1"), "test")
    ).to.be.revertedWithCustomError(registry, "NotSlashingAuthority");
  });

  it("slashes the specified amount and caps at available stake", async () => {
    const { registry, issuer, other } = await setup();

    await registry.connect(other).slash(issuer.address, ethers.parseEther("2"), "misissuance");
    const info = await registry.issuers(issuer.address);
    expect(info.stake).to.equal(ethers.parseEther("3"));
    expect(info.slashedAmount).to.equal(ethers.parseEther("2"));

    // Slash more than remaining — caps at available
    await registry.connect(other).slash(issuer.address, ethers.parseEther("10"), "more");
    const info2 = await registry.issuers(issuer.address);
    expect(info2.stake).to.equal(0n);
    expect(info2.slashedAmount).to.equal(ethers.parseEther("5"));
  });

  it("emits IssuerSlashed with reason and amount", async () => {
    const { registry, issuer, other } = await setup();
    await expect(registry.connect(other).slash(issuer.address, ethers.parseEther("1"), "doc forgery"))
      .to.emit(registry, "IssuerSlashed")
      .withArgs(issuer.address, ethers.parseEther("1"), "doc forgery");
  });
});
