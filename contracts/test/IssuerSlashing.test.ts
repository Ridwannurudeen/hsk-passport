import { expect } from "chai";
import { ethers } from "hardhat";

describe("IssuerRegistry — slashing via Timelock authority", () => {
  async function setup(treasuryOverride?: string) {
    const [owner, issuer, other, attacker, treasury] =
      await ethers.getSigners();

    const Registry = await ethers.getContractFactory("IssuerRegistry");
    const registry = await Registry.deploy(treasuryOverride ?? treasury.address);
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

  it("queues slashed funds for the immutable treasury, not the owner", async () => {
    const { registry, issuer, other, treasury } = await setup();
    const before = await ethers.provider.getBalance(treasury.address);
    await registry
      .connect(other)
      .slash(issuer.address, ethers.parseEther("2"), "misissuance");
    expect(await registry.pendingTreasuryWithdrawals()).to.equal(ethers.parseEther("2"));
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(before);

    await registry.withdrawTreasury();
    const after = await ethers.provider.getBalance(treasury.address);
    expect(after - before).to.equal(ethers.parseEther("2"));
  });

  it("does not brick slashing when the treasury cannot receive ETH", async () => {
    const MockDID = await ethers.getContractFactory("MockHashKeyDID");
    const rejectingTreasury = await MockDID.deploy();
    await rejectingTreasury.waitForDeployment();
    const { registry, issuer, other } = await setup(await rejectingTreasury.getAddress());

    await expect(
      registry.connect(other).slash(issuer.address, ethers.parseEther("1"), "bad treasury")
    ).to.emit(registry, "IssuerSlashed");
    expect(await registry.pendingTreasuryWithdrawals()).to.equal(ethers.parseEther("1"));
    await expect(registry.withdrawTreasury())
      .to.be.revertedWithCustomError(registry, "TransferFailed");
    expect(await registry.pendingTreasuryWithdrawals()).to.equal(ethers.parseEther("1"));
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

  it("a deactivated issuer with residual stake can recover it (no locked funds)", async () => {
    const { registry, issuer, other, owner } = await setup();
    // Non-zero community minimum so a partial slash deactivates while leaving residual.
    await registry
      .connect(owner)
      .setStakeRequirements(
        ethers.parseEther("2"),
        ethers.parseEther("1000"),
        ethers.parseEther("10000"),
      );
    // Slash 4 of 5 -> residual 1 (<= communityMin 2) -> deactivated but funded.
    await registry
      .connect(other)
      .slash(issuer.address, ethers.parseEther("4"), "partial");
    expect(await registry.isActiveIssuer(issuer.address)).to.equal(false);
    expect((await registry.issuers(issuer.address)).stake).to.equal(
      ethers.parseEther("1"),
    );

    // Previously this reverted NotActive, locking the residual. Now it works.
    await registry.connect(issuer).requestUnstake();
    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);
    await expect(registry.connect(issuer).withdrawStake())
      .to.emit(registry, "Unstaked")
      .withArgs(issuer.address, ethers.parseEther("1"));
    expect((await registry.issuers(issuer.address)).stake).to.equal(0n);
  });

  it("a deactivated issuer with residual stake is still slashable", async () => {
    const { registry, issuer, other, owner } = await setup();
    await registry
      .connect(owner)
      .setStakeRequirements(
        ethers.parseEther("2"),
        ethers.parseEther("1000"),
        ethers.parseEther("10000"),
      );
    await registry
      .connect(other)
      .slash(issuer.address, ethers.parseEther("4"), "partial");
    expect(await registry.isActiveIssuer(issuer.address)).to.equal(false);

    // Residual 1 ether is still slashable (was blocked by the old active check).
    const before = await registry.pendingTreasuryWithdrawals();
    await registry
      .connect(other)
      .slash(issuer.address, ethers.parseEther("1"), "residual");
    const after = await registry.pendingTreasuryWithdrawals();
    expect(after - before).to.equal(ethers.parseEther("1"));
    expect((await registry.issuers(issuer.address)).stake).to.equal(0n);
  });

  it("requestUnstake freezes the issuer (slash-escape defense)", async () => {
    const { registry, issuer } = await setup();
    await registry.connect(issuer).requestUnstake();
    expect(await registry.isActiveIssuer(issuer.address)).to.equal(false);
  });

  it("re-staking reactivates and ADDS to stake without duplicating the issuer", async () => {
    const { registry, issuer } = await setup(); // staked 5, active
    await registry.connect(issuer).requestUnstake(); // frozen + 7d clock
    expect(await registry.isActiveIssuer(issuer.address)).to.equal(false);

    await registry
      .connect(issuer)
      .stakeAndRegister("ipfs://issuer", { value: ethers.parseEther("3") });
    const info = await registry.issuers(issuer.address);
    expect(info.stake).to.equal(ethers.parseEther("8")); // 5 + 3, not overwritten
    expect(info.active).to.equal(true); // reactivated
    expect(await registry.unstakeRequestedAt(issuer.address)).to.equal(0n); // exit cancelled
    expect(await registry.issuerCount()).to.equal(1n); // not duplicated
  });

  it("re-staking cancels a pending unstake so it cannot be pre-armed", async () => {
    const { registry, issuer } = await setup();
    await registry.connect(issuer).requestUnstake();
    await registry
      .connect(issuer)
      .stakeAndRegister("ipfs://issuer", { value: ethers.parseEther("1") });
    await expect(
      registry.connect(issuer).withdrawStake(),
    ).to.be.revertedWithCustomError(registry, "CooldownNotElapsed");
  });

  it("slash resets a pending unstake clock (no instant residual escape)", async () => {
    const { registry, issuer, other, owner } = await setup();
    await registry
      .connect(owner)
      .setStakeRequirements(
        ethers.parseEther("2"),
        ethers.parseEther("1000"),
        ethers.parseEther("10000"),
      );
    await registry.connect(issuer).requestUnstake(); // clock armed
    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);
    // Cooldown elapsed — but a slash lands first and cancels the withdrawal.
    await registry
      .connect(other)
      .slash(issuer.address, ethers.parseEther("1"), "caught");
    await expect(
      registry.connect(issuer).withdrawStake(),
    ).to.be.revertedWithCustomError(registry, "CooldownNotElapsed");
  });
});
