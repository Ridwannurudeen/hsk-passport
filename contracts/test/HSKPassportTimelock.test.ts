import { expect } from "chai";
import { ethers } from "hardhat";

describe("HSKPassportTimelock", () => {
  it("deploys only with a zero admin", async () => {
    const [owner] = await ethers.getSigners();
    const Timelock = await ethers.getContractFactory("HSKPassportTimelock");

    const timelock = await Timelock.deploy([owner.address], [ethers.ZeroAddress], ethers.ZeroAddress);
    await timelock.waitForDeployment();

    expect(await timelock.getMinDelay()).to.equal(48n * 60n * 60n);
  });

  it("rejects a non-zero admin", async () => {
    const [owner] = await ethers.getSigners();
    const Timelock = await ethers.getContractFactory("HSKPassportTimelock");

    await expect(
      Timelock.deploy([owner.address], [owner.address], owner.address)
    ).to.be.revertedWithCustomError(Timelock, "TimelockAdminMustBeZero");
  });
});
