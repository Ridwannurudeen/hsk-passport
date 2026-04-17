import * as path from "node:path";
import * as fs from "node:fs";
import { FreshnessTree, type FreshnessMerkleProof } from "./freshnessTree";

// snarkjs has no published types; require it at runtime
// eslint-disable-next-line @typescript-eslint/no-require-imports
const snarkjs = require("snarkjs");

const CIRCUITS_ROOT = path.resolve(__dirname, "..", "..", "..", "circuits", "build");
const WASM = path.join(CIRCUITS_ROOT, "credential_freshness_js", "credential_freshness.wasm");
const ZKEY = path.join(CIRCUITS_ROOT, "freshness_final.zkey");

export interface FreshnessProofInputs {
  identitySecret: bigint;
  issuanceTime: bigint;
  merkleProof: FreshnessMerkleProof;
  earliestAcceptable: bigint;
  scope: bigint;
}

export interface FreshnessProofOutput {
  proofA: [bigint, bigint];
  proofB: [[bigint, bigint], [bigint, bigint]];
  proofC: [bigint, bigint];
  nullifier: bigint;
  merkleRoot: bigint;
  earliestAcceptable: bigint;
  scope: bigint;
  raw: { proof: unknown; publicSignals: string[] };
}

/** Assert the circuit/zkey artefacts exist before calling snarkjs. */
export function ensureArtefacts(): void {
  const missing: string[] = [];
  if (!fs.existsSync(WASM)) missing.push(WASM);
  if (!fs.existsSync(ZKEY)) missing.push(ZKEY);
  if (missing.length > 0) {
    throw new Error(
      `Freshness circuit artefacts missing:\n  ${missing.join(
        "\n  "
      )}\nRun \`node circuits/scripts/build.js\` first.`
    );
  }
}

export async function generateFreshnessProof(
  inputs: FreshnessProofInputs
): Promise<FreshnessProofOutput> {
  ensureArtefacts();

  const circuitInput = {
    identitySecret: inputs.identitySecret.toString(),
    issuanceTime: inputs.issuanceTime.toString(),
    pathElements: inputs.merkleProof.pathElements.map((x) => x.toString()),
    pathIndices: inputs.merkleProof.pathIndices.map((x) => x.toString()),
    merkleRoot: inputs.merkleProof.root.toString(),
    earliestAcceptable: inputs.earliestAcceptable.toString(),
    scope: inputs.scope.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, WASM, ZKEY);

  // Public signal order (from circuit): [nullifier, merkleRoot, earliestAcceptable, scope]
  const [nullifier, merkleRoot, earliestAcceptable, scope] = publicSignals.map((s: string) => BigInt(s));

  // snarkjs emits pi_b in [[x1,x0],[y1,y0]] order but the Solidity verifier expects the
  // G2 coordinates in reversed form. Mirror the standard pattern from snarkjs templates.
  const proofA: [bigint, bigint] = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const proofB: [[bigint, bigint], [bigint, bigint]] = [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
  ];
  const proofC: [bigint, bigint] = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

  return {
    proofA,
    proofB,
    proofC,
    nullifier,
    merkleRoot,
    earliestAcceptable,
    scope,
    raw: { proof, publicSignals },
  };
}

export { FreshnessTree, type FreshnessMerkleProof } from "./freshnessTree";
