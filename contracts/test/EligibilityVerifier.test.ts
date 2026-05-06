import { expect } from "chai";
import { ethers } from "hardhat";

const SCOPE = 111n;
const FRESHNESS_SCOPE = 222n;
const FRESHNESS_SCOPE_MASK = (1n << 250n) - 1n;
const ZERO_PROOF = {
  merkleTreeDepth: 0n,
  merkleTreeRoot: 0n,
  nullifier: 0n,
  message: 0n,
  scope: 0n,
  points: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
};
const ZERO_FRESHNESS = {
  merkleRoot: 0n,
  earliestAcceptable: 0n,
  scope: 0n,
  nullifier: 0n,
  proofA: [0n, 0n] as [bigint, bigint],
  proofB: [
    [0n, 0n],
    [0n, 0n],
  ] as [[bigint, bigint], [bigint, bigint]],
  proofC: [0n, 0n] as [bigint, bigint],
};

function semaphoreProof(groupId: bigint, account: string, nullifier = 9001n, scope = SCOPE) {
  return {
    merkleTreeDepth: 20n,
    merkleTreeRoot: groupId,
    nullifier,
    message: BigInt(account),
    scope,
    points: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n],
  };
}

function emptyEligibilityProof() {
  return {
    credentialProofs: [],
    hasJurisdictionProof: false,
    jurisdictionProof: ZERO_PROOF,
    hasFreshnessProof: false,
    freshnessProof: ZERO_FRESHNESS,
  };
}

function boundFreshnessScope(account: string) {
  return BigInt(ethers.solidityPackedKeccak256(["uint256", "address"], [FRESHNESS_SCOPE, account])) &
    FRESHNESS_SCOPE_MASK;
}

function policy(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    callerBound: true,
    semaphoreScope: SCOPE,
    requiredCredentialGroups: [25n],
    allowedJurisdictionGroups: [],
    freshnessGroupId: 0n,
    freshnessWindowSeconds: 0n,
    freshnessScope: 0n,
    metadataURI: "ipfs://policy/rwa-basic-kyc",
    ...overrides,
  };
}

describe("HSKEligibilityVerifier", function () {
  async function fixture() {
    const [owner, user, other] = await ethers.getSigners();

    const Passport = await ethers.getContractFactory("MockEligibilityPassport");
    const passport = await Passport.deploy();
    await passport.setGroupAccepted(25, true);
    await passport.setGroupAccepted(26, true);
    await passport.setGroupAccepted(27, true);
    await passport.setGroupAccepted(28, true);

    const Freshness = await ethers.getContractFactory("MockEligibilityFreshness");
    const freshness = await Freshness.deploy();

    const Verifier = await ethers.getContractFactory("HSKEligibilityVerifier");
    const verifier = await Verifier.deploy(await passport.getAddress(), await freshness.getAddress());

    const policyId = ethers.id("rwa-basic-kyc");
    await verifier.setPolicy(policyId, policy());

    return { owner, user, other, passport, freshness, verifier, policyId };
  }

  it("verifies one policy ID with a caller-bound credential proof", async function () {
    const { user, verifier, policyId } = await fixture();
    const account = await user.getAddress();
    const proof = {
      ...emptyEligibilityProof(),
      credentialProofs: [semaphoreProof(25n, account)],
    };

    expect(await verifier.verifyEligibility(policyId, proof, account)).to.equal(true);
  });

  it("rejects proofs bound to a different caller", async function () {
    const { user, other, verifier, policyId } = await fixture();
    const proof = {
      ...emptyEligibilityProof(),
      credentialProofs: [semaphoreProof(25n, await other.getAddress())],
    };

    expect(await verifier.verifyEligibility(policyId, proof, await user.getAddress())).to.equal(false);
  });

  it("rejects proofs generated for the wrong nullifier scope", async function () {
    const { user, verifier, policyId } = await fixture();
    const proof = {
      ...emptyEligibilityProof(),
      credentialProofs: [semaphoreProof(25n, await user.getAddress(), 9001n, 999n)],
    };

    expect(await verifier.verifyEligibility(policyId, proof, await user.getAddress())).to.equal(false);
  });

  it("supports multi-credential policies with one shared nullifier", async function () {
    const { user, verifier } = await fixture();
    const policyId = ethers.id("institutional-rwa");
    await verifier.setPolicy(policyId, policy({
      requiredCredentialGroups: [25n, 26n],
      metadataURI: "ipfs://policy/institutional-rwa",
    }));

    const account = await user.getAddress();
    const proof = {
      ...emptyEligibilityProof(),
      credentialProofs: [
        semaphoreProof(25n, account, 123n),
        semaphoreProof(26n, account, 123n),
      ],
    };

    expect(await verifier.verifyEligibility(policyId, proof, account)).to.equal(true);

    const mixedIdentityProof = {
      ...proof,
      credentialProofs: [
        semaphoreProof(25n, account, 123n),
        semaphoreProof(26n, account, 456n),
      ],
    };
    expect(await verifier.verifyEligibility(policyId, mixedIdentityProof, account)).to.equal(false);
  });

  it("supports one-of jurisdiction policies without revealing a separate policy path", async function () {
    const { user, verifier } = await fixture();
    const policyId = ethers.id("apac-rwa");
    await verifier.setPolicy(policyId, policy({
      requiredCredentialGroups: [25n],
      allowedJurisdictionGroups: [27n, 28n],
      metadataURI: "ipfs://policy/apac-rwa",
    }));

    const account = await user.getAddress();
    const proof = {
      ...emptyEligibilityProof(),
      credentialProofs: [semaphoreProof(25n, account, 321n)],
      hasJurisdictionProof: true,
      jurisdictionProof: semaphoreProof(28n, account, 321n),
    };

    expect(await verifier.verifyEligibility(policyId, proof, account)).to.equal(true);

    const wrongRegion = {
      ...proof,
      jurisdictionProof: semaphoreProof(29n, account, 321n),
    };
    expect(await verifier.verifyEligibility(policyId, wrongRegion, account)).to.equal(false);
  });

  it("enforces freshness windows with the v6 freshness proof", async function () {
    const { user, verifier } = await fixture();
    const policyId = ethers.id("fresh-rwa");
    const windowSeconds = 180n * 24n * 60n * 60n;
    await verifier.setPolicy(policyId, policy({
      freshnessGroupId: 25n,
      freshnessWindowSeconds: windowSeconds,
      freshnessScope: FRESHNESS_SCOPE,
      metadataURI: "ipfs://policy/fresh-rwa",
    }));

    const block = await ethers.provider.getBlock("latest");
    const now = BigInt(block!.timestamp);
    const account = await user.getAddress();
    const freshProof = {
      ...emptyEligibilityProof(),
      credentialProofs: [semaphoreProof(25n, account, 654n)],
      hasFreshnessProof: true,
      freshnessProof: {
        ...ZERO_FRESHNESS,
        merkleRoot: 25n,
        earliestAcceptable: now - 60n,
        scope: boundFreshnessScope(account),
        nullifier: 654n,
      },
    };

    expect(await verifier.verifyEligibility(policyId, freshProof, account)).to.equal(true);

    const staleProof = {
      ...freshProof,
      freshnessProof: {
        ...freshProof.freshnessProof,
        earliestAcceptable: now - windowSeconds - 10n,
      },
    };
    expect(await verifier.verifyEligibility(policyId, staleProof, account)).to.equal(false);

    const unboundFreshnessScope = {
      ...freshProof,
      freshnessProof: {
        ...freshProof.freshnessProof,
        scope: FRESHNESS_SCOPE,
      },
    };
    expect(await verifier.verifyEligibility(policyId, unboundFreshnessScope, account)).to.equal(false);
  });

  it("consumes the shared eligibility nullifier for state-changing gates", async function () {
    const { user, verifier, policyId } = await fixture();
    const account = await user.getAddress();
    const proof = {
      ...emptyEligibilityProof(),
      credentialProofs: [semaphoreProof(25n, account, 777n)],
    };

    await expect(verifier.requireEligible(policyId, proof, account))
      .to.emit(verifier, "EligibilityVerified")
      .withArgs(policyId, account, 777n);

    await expect(verifier.requireEligible(policyId, proof, account))
      .to.be.revertedWithCustomError(verifier, "NullifierAlreadyUsed")
      .withArgs(policyId, 777n);
  });

  it("guards policy administration", async function () {
    const { other, verifier } = await fixture();
    await expect(
      verifier.connect(other).setPolicy(ethers.id("other"), policy()),
    ).to.be.revertedWithCustomError(verifier, "NotOwner");

    await expect(
      verifier.setPolicy(ethers.id("invalid"), policy({
        requiredCredentialGroups: [],
        allowedJurisdictionGroups: [],
        freshnessWindowSeconds: 0n,
      })),
    ).to.be.revertedWithCustomError(verifier, "InvalidPolicy");

    await expect(
      verifier.setPolicy(ethers.ZeroHash, policy()),
    ).to.be.revertedWithCustomError(verifier, "InvalidPolicy");
  });
});
