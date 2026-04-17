"use client";

import { useMemo, useState } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import {
  FreshnessTree,
  generateFreshnessProof,
  randomSecret,
  type FreshnessProof,
} from "@/lib/freshness";
import {
  FRESHNESS_ADDRESSES,
  FRESHNESS_ARTEFACTS,
  HSK_PASSPORT_FRESHNESS_ABI,
  GROUPS,
  GROUP_NAMES,
  RPC_URL,
  EXPLORER_URL,
} from "@/lib/contracts";
import demoData from "@/lib/freshness-demo-data.json";

const ZERO = "0x0000000000000000000000000000000000000000";
const CONTRACTS_LIVE = FRESHNESS_ADDRESSES.hskPassportFreshness !== ZERO;

const SECONDS_PER_DAY = 86_400n;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function short(n: bigint): string {
  const s = n.toString(16);
  if (s.length <= 12) return `0x${s}`;
  return `0x${s.slice(0, 6)}…${s.slice(-6)}`;
}

/**
 * Reconstruct the on-chain-seeded tree client-side from the static seed data.
 * Requires exact match with what scripts/seed-freshness-demo.ts posted.
 */
function buildSeededTree(): { tree: FreshnessTree; index: number } {
  const tree = new FreshnessTree();
  for (const leafStr of demoData.tree.leaves) {
    tree.insert(BigInt(leafStr));
  }
  return { tree, index: demoData.demoIdentity.leafIndex };
}

// Sandbox mode — random identity, arbitrary issuance time. Matches original
// page layout; on-chain verify won't accept it (UnknownRoot) but proof gen
// itself works end-to-end.
function buildSandboxTree(userLeaf: bigint): { tree: FreshnessTree; index: number } {
  const tree = new FreshnessTree();
  for (let i = 1; i <= 7; i++) {
    tree.insert(
      FreshnessTree.makeLeaf(
        FreshnessTree.identityCommitment(BigInt(i * 1_000_003)),
        BigInt(1_000_000 + i)
      )
    );
  }
  const index = tree.insert(userLeaf);
  return { tree, index };
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

type Mode = "live" | "sandbox";

export default function FreshDemoPage() {
  const [mode, setMode] = useState<Mode>(CONTRACTS_LIVE ? "live" : "sandbox");

  // User inputs
  const [daysAcceptable, setDaysAcceptable] = useState(90);
  const [daysSinceIssuance, setDaysSinceIssuance] = useState(30);

  // Derived
  const now = useMemo(() => Math.floor(Date.now() / 1000), []);
  const earliestAcceptable = useMemo(
    () => BigInt(now) - SECONDS_PER_DAY * BigInt(daysAcceptable),
    [now, daysAcceptable]
  );

  // In live mode, identity + issuanceTime come from the seed. In sandbox mode,
  // we generate fresh values each run.
  const liveIdentitySecret = BigInt(demoData.demoIdentity.secret);
  const liveIssuanceTime = BigInt(demoData.demoIdentity.issuanceTime);
  const liveDaysSinceIssuance = Math.floor(
    (now - Number(liveIssuanceTime)) / 86_400
  );

  const issuanceTime =
    mode === "live"
      ? liveIssuanceTime
      : BigInt(now) - SECONDS_PER_DAY * BigInt(daysSinceIssuance);
  const effectiveDaysSince = mode === "live" ? liveDaysSinceIssuance : daysSinceIssuance;
  const isFresh = effectiveDaysSince <= daysAcceptable;

  // Flow state
  const [stage, setStage] = useState<
    | "idle"
    | "generating"
    | "generated"
    | "verifying"
    | "verified-ok"
    | "verified-fail"
    | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<FreshnessProof | null>(null);
  const [proveMs, setProveMs] = useState<number | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [verifyMode, setVerifyMode] = useState<"onchain" | "simulated" | null>(null);

  async function handleGenerate() {
    setError(null);
    setProof(null);
    setProveMs(null);
    setVerifyResult(null);
    setVerifyMode(null);
    setStage("generating");

    try {
      let identitySecret: bigint;
      let mp;
      if (mode === "live") {
        identitySecret = liveIdentitySecret;
        const { tree, index } = buildSeededTree();
        mp = tree.proof(index);
      } else {
        identitySecret = randomSecret();
        const commitment = FreshnessTree.identityCommitment(identitySecret);
        const leaf = FreshnessTree.makeLeaf(commitment, issuanceTime);
        const { tree, index } = buildSandboxTree(leaf);
        mp = tree.proof(index);
      }

      const scope = BigInt(now); // unique scope per page load — avoids replay collisions on repeat clicks

      const t0 = performance.now();
      const p = await generateFreshnessProof({
        identitySecret,
        issuanceTime,
        merkleProof: mp,
        earliestAcceptable,
        scope,
        wasmUrl: FRESHNESS_ARTEFACTS.wasm,
        zkeyUrl: FRESHNESS_ARTEFACTS.zkey,
      });
      const elapsed = performance.now() - t0;
      setProof(p);
      setProveMs(elapsed);
      setStage("generated");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/GreaterEqThan|constraint|Assert Failed/i.test(msg)) {
        setError(
          `Proof generation rejected by the circuit. The credential is ${effectiveDaysSince} days old but the dApp's freshness window is ${daysAcceptable} days. ${
            mode === "live"
              ? "Raise the 'freshness window' slider above " + effectiveDaysSince + " to make this credential acceptable."
              : "Lower 'days since issuance' or raise 'freshness window' and try again."
          }`
        );
      } else {
        setError(msg);
      }
      setStage("error");
    }
  }

  async function handleVerify() {
    if (!proof) return;
    setError(null);
    setVerifyResult(null);
    setStage("verifying");

    try {
      if (!CONTRACTS_LIVE || mode === "sandbox") {
        await new Promise((r) => setTimeout(r, 400));
        if (mode === "sandbox") {
          setVerifyResult(
            "Sandbox mode — the sandbox tree root isn't on-chain, so previewVerifyFresh would return UnknownRoot. Switch to Live mode to verify against the seeded credential."
          );
        } else {
          setVerifyResult(
            "Simulated — contracts not deployed yet. Run scripts/deploy-freshness.ts + seed-freshness-demo.ts to go live."
          );
        }
        setVerifyMode("simulated");
        setStage("verified-ok");
        return;
      }

      const provider = new JsonRpcProvider(RPC_URL);
      const composer = new Contract(
        FRESHNESS_ADDRESSES.hskPassportFreshness,
        HSK_PASSPORT_FRESHNESS_ABI,
        provider
      );
      const ok: boolean = await composer.previewVerifyFresh(
        BigInt(GROUPS.KYC_VERIFIED),
        proof.merkleRoot,
        proof.earliestAcceptable,
        proof.scope,
        proof.nullifier,
        proof.proofA,
        proof.proofB,
        proof.proofC
      );
      setVerifyMode("onchain");
      if (ok) {
        setVerifyResult(
          `Proof accepted on-chain. HSKPassportFreshness.previewVerifyFresh() returned true. Proof is valid, nullifier unused, merkleRoot in registry history.`
        );
        setStage("verified-ok");
      } else {
        setVerifyResult(
          `Proof rejected on-chain. Most likely cause: nullifier already consumed from a previous run (scope is per-page-load, but if you reloaded with the same timestamp, collision is possible). Reload the page for a fresh scope.`
        );
        setStage("verified-fail");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-8 font-sans">
      <header className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" />
          v6 · per-prover ZK range proof
        </div>
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">
          Credential Freshness — live ZK demo
        </h1>
        <p className="text-gray-600">
          Prove your KYC credential is within a dApp&apos;s freshness window, without revealing the
          identity commitment or the exact issuance time. Groth16 proof generation runs in your
          browser; verification runs on HashKey testnet.
        </p>
      </header>

      {/* Mode toggle */}
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        <button
          onClick={() => {
            setMode("live");
            setStage("idle");
            setProof(null);
          }}
          disabled={!CONTRACTS_LIVE}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
            mode === "live"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-gray-50 text-gray-700 hover:bg-gray-100"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Live · seeded credential, on-chain verify
        </button>
        <button
          onClick={() => {
            setMode("sandbox");
            setStage("idle");
            setProof(null);
          }}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
            mode === "sandbox"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-gray-50 text-gray-700 hover:bg-gray-100"
          }`}
        >
          Sandbox · arbitrary age, simulated verify
        </button>
      </div>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">1. Scenario</h2>
        {mode === "live" ? (
          <div className="rounded-lg bg-gray-50 p-4 text-sm">
            <p className="mb-2 text-gray-700">
              A demo credential was seeded on HashKey testnet when{" "}
              <code className="rounded bg-white px-1 font-mono text-xs">
                scripts/seed-freshness-demo.ts
              </code>{" "}
              ran. Only the freshness-window slider is active in this mode — the credential&apos;s
              issuance time is fixed and on-chain.
            </p>
            <div className="grid grid-cols-1 gap-1 font-mono text-xs text-gray-800 md:grid-cols-2">
              <div>
                <span className="text-gray-500">issuanceTime (on-chain):</span>{" "}
                {demoData.demoIdentity.issuanceTimeISO.slice(0, 10)} · {liveDaysSinceIssuance} days ago
              </div>
              <div>
                <span className="text-gray-500">group:</span> {GROUP_NAMES[GROUPS.KYC_VERIFIED]}
              </div>
              <div>
                <span className="text-gray-500">seeded leaf index:</span>{" "}
                {demoData.demoIdentity.leafIndex}
              </div>
              <div>
                <span className="text-gray-500">tree root (on-chain):</span>{" "}
                {short(BigInt(demoData.tree.root))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Days since issuance</span>
              <input
                type="range"
                min={1}
                max={365}
                value={daysSinceIssuance}
                onChange={(e) => setDaysSinceIssuance(Number(e.target.value))}
                className="mt-2 w-full"
              />
              <span className="text-sm text-gray-500">{daysSinceIssuance} days ago</span>
            </label>
            <label className="block md:hidden">
              <span className="text-sm font-medium text-gray-700">&nbsp;</span>
            </label>
          </div>
        )}

        <label className="mt-4 block">
          <span className="text-sm font-medium text-gray-700">dApp freshness window</span>
          <input
            type="range"
            min={7}
            max={365}
            value={daysAcceptable}
            onChange={(e) => setDaysAcceptable(Number(e.target.value))}
            className="mt-2 w-full"
          />
          <span className="text-sm text-gray-500">require within {daysAcceptable} days</span>
        </label>
        {!isFresh && (
          <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">
            Credential ({effectiveDaysSince}d) is older than the freshness window ({daysAcceptable}d).
            The circuit will refuse to produce a proof — that&apos;s the privacy-preserving expiry check.
          </p>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">2. Generate the ZK proof</h2>
        <button
          onClick={handleGenerate}
          disabled={stage === "generating"}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stage === "generating" ? "Generating proof…" : "Generate proof"}
        </button>
        {proveMs !== null && proof && (
          <div className="mt-4 rounded-lg bg-green-50 p-4 text-sm text-green-900">
            <p className="font-medium">Proof generated in {proveMs.toFixed(0)} ms</p>
            <div className="mt-2 grid grid-cols-1 gap-1 font-mono text-xs">
              <div>
                <span className="text-green-700">nullifier:</span> {short(proof.nullifier)}
              </div>
              <div>
                <span className="text-green-700">merkleRoot:</span> {short(proof.merkleRoot)}
              </div>
              <div>
                <span className="text-green-700">earliestAcceptable:</span>{" "}
                {new Date(Number(proof.earliestAcceptable) * 1000).toISOString().slice(0, 10)}
              </div>
              <div>
                <span className="text-green-700">scope:</span> {short(proof.scope)}
              </div>
            </div>
          </div>
        )}
        {stage === "error" && error && (
          <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            <p>{error}</p>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">
          3. Verify{" "}
          {mode === "live" && CONTRACTS_LIVE ? (
            <span className="text-sm font-normal text-green-600">
              on HashKey testnet · {GROUP_NAMES[GROUPS.KYC_VERIFIED]}
            </span>
          ) : (
            <span className="text-sm font-normal text-amber-600">simulated</span>
          )}
        </h2>
        {mode === "live" && CONTRACTS_LIVE && (
          <p className="mb-3 text-xs text-gray-500">
            Composer:{" "}
            <a
              className="font-mono text-indigo-600 hover:underline"
              href={`${EXPLORER_URL}/address/${FRESHNESS_ADDRESSES.hskPassportFreshness}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {short(BigInt(FRESHNESS_ADDRESSES.hskPassportFreshness))}
            </a>{" "}
            · Registry:{" "}
            <a
              className="font-mono text-indigo-600 hover:underline"
              href={`${EXPLORER_URL}/address/${FRESHNESS_ADDRESSES.freshnessRegistry}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {short(BigInt(FRESHNESS_ADDRESSES.freshnessRegistry))}
            </a>
          </p>
        )}
        <button
          onClick={handleVerify}
          disabled={!proof || stage === "verifying"}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stage === "verifying" ? "Verifying…" : "Verify proof"}
        </button>
        {verifyResult && (
          <div
            className={`mt-4 rounded-lg p-4 text-sm ${
              stage === "verified-ok" && verifyMode === "onchain"
                ? "bg-green-50 text-green-900"
                : stage === "verified-fail"
                  ? "bg-red-50 text-red-900"
                  : "bg-amber-50 text-amber-900"
            }`}
          >
            {verifyResult}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
        <h3 className="mb-2 font-medium text-gray-800">What you just saw</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            A real Groth16 proof generated in your browser using the compiled{" "}
            <code className="mx-1 rounded bg-white px-1 font-mono text-xs">
              credential_freshness.circom
            </code>{" "}
            circuit (depth-16 Poseidon Merkle + 64-bit range check, 4,665 wires).
          </li>
          <li>
            The verifier contract is the auto-generated{" "}
            <code className="mx-1 rounded bg-white px-1 font-mono text-xs">
              FreshnessVerifier.sol
            </code>{" "}
            from snarkjs.
          </li>
          <li>
            The circuit enforces{" "}
            <code className="mx-1 rounded bg-white px-1 font-mono text-xs">
              issuanceTime ≥ earliestAcceptable
            </code>
            . If the credential is older, the proof refuses to generate. That&apos;s the
            privacy-preserving expiry check — a per-prover ZK range proof, not a group-window
            approximation.
          </li>
        </ul>
      </section>
    </main>
  );
}
