import { describe, expect, it } from "vitest";
import { Interface } from "ethers";
import {
  HSK_ELIGIBILITY_VERIFIER_ABI,
  buildEligibilityProof,
  eligibilityFreshnessScope,
  eligibilityPolicyId,
  scopeToField,
} from "../src";

const semaphoreProof = {
  merkleTreeDepth: 20n,
  merkleTreeRoot: 25n,
  nullifier: 123n,
  message: 456n,
  scope: 789n,
  points: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n],
};

describe("eligibility helpers", () => {
  it("exports a parseable verifier ABI", () => {
    const iface = new Interface(HSK_ELIGIBILITY_VERIFIER_ABI);
    expect(iface.getFunction("verifyEligibility")?.name).toBe("verifyEligibility");
    expect(iface.getFunction("requireEligible")?.name).toBe("requireEligible");
  });

  it("derives stable policy IDs and scope field values", () => {
    expect(eligibilityPolicyId("my-rwa:mint:eligibility")).toMatch(/^0x[0-9a-f]{64}$/);
    expect(scopeToField(25)).toBe(25n);
    expect(scopeToField(25n)).toBe(25n);
    expect(scopeToField("abc")).toBe(0x616263n);
  });

  it("derives account-bound freshness scopes under the circuit field mask", () => {
    const scope = eligibilityFreshnessScope(222n, "0x0000000000000000000000000000000000000001");
    expect(scope).toBeLessThan(1n << 250n);
    expect(scope).not.toBe(222n);
  });

  it("formats optional proof bundle fields for the verifier tuple", () => {
    const proof = buildEligibilityProof({ credentialProofs: [semaphoreProof] });
    expect(proof.credentialProofs).toHaveLength(1);
    expect(proof.hasJurisdictionProof).toBe(false);
    expect(proof.jurisdictionProof.points).toHaveLength(8);
    expect(proof.hasFreshnessProof).toBe(false);
    expect(proof.freshnessProof.proofB).toEqual([
      [0n, 0n],
      [0n, 0n],
    ]);
  });

  it("rejects malformed Semaphore proof point arrays", () => {
    expect(() =>
      buildEligibilityProof({
        credentialProofs: [{ ...semaphoreProof, points: [1n, 2n, 3n] }],
      }),
    ).toThrow("Semaphore proof must contain exactly 8 points");
  });
});
