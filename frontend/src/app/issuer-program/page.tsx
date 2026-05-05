"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Contract, parseEther } from "ethers";
import { connectWallet } from "@/lib/wallet";
import {
  MAINNET_ADDRESSES,
  MAINNET_EXPLORER_URL,
  ISSUER_REGISTRY_ABI,
  ISSUER_TIER_NAMES,
} from "@/lib/contracts";
import { useToast } from "@/components/Toast";

const KYC_METHODS = [
  "sumsub",
  "onfido",
  "jumio",
  "veriff",
  "persona",
  "in-house",
  "other",
] as const;

const KYC_METHODS_REQUIRING_NOTES = new Set<(typeof KYC_METHODS)[number]>(["in-house", "other"]);

const SUPPORTED_CREDENTIAL_TYPES = [
  "KYCVerified",
  "AccreditedInvestor",
  "HKResident",
  "SGResident",
  "AEResident",
] as const;

const KEY_CUSTODY_OPTIONS = ["hsm", "mpc", "multisig", "hot-wallet"] as const;

interface FormState {
  name: string;
  website: string;
  email: string;
  kycMethod: (typeof KYC_METHODS)[number];
  kycMethodNotes: string;
  jurisdictions: string;
  supportedCredentials: Set<string>;
  keyCustody: (typeof KEY_CUSTODY_OPTIONS)[number] | "";
  metadataURI: string;
  stakeAmount: string;
}

const INITIAL: FormState = {
  name: "",
  website: "",
  email: "",
  kycMethod: "sumsub",
  kycMethodNotes: "",
  jurisdictions: "",
  supportedCredentials: new Set(),
  keyCustody: "",
  metadataURI: "",
  stakeAmount: "",
};

export default function IssuerProgramPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tx, setTx] = useState<string | null>(null);
  const [step, setStep] = useState<"build" | "host" | "stake">("build");

  const generatedJSON = useMemo(() => buildMetadataJSON(form), [form]);
  const tier = tierForStake(form.stakeAmount);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleCred(type: string) {
    setForm((f) => {
      const next = new Set(f.supportedCredentials);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { ...f, supportedCredentials: next };
    });
  }

  async function copyJSON() {
    try {
      await navigator.clipboard.writeText(generatedJSON);
      toast("Metadata JSON copied — host it at a stable HTTPS or IPFS URL.", "success");
    } catch {
      toast("Copy failed — select the JSON manually and copy.", "error");
    }
  }

  async function handleConnect() {
    try {
      const { address: addr } = await connectWallet("mainnet");
      setAddress(addr);
      setConnected(true);
      toast(`Connected ${addr.slice(0, 6)}…${addr.slice(-4)}`, "success");
    } catch (e) {
      toast(`Connect failed: ${(e as Error).message.slice(0, 100)}`, "error");
    }
  }

  async function handleStake() {
    const uri = form.metadataURI.trim();
    if (!uri) {
      toast("Paste your metadata URI before staking.", "error");
      return;
    }
    // Mirror backend: only https:// or ipfs:// are accepted; the backend
    // additionally rejects private IPs and non-CID ipfs paths.
    if (!/^(https:\/\/|ipfs:\/\/)/i.test(uri)) {
      toast("metadataURI must start with https:// or ipfs://", "error");
      return;
    }
    // Up-to-18-decimal positive number, no scientific notation.
    if (!/^\d+(\.\d{1,18})?$/.test(form.stakeAmount)) {
      toast(
        "Enter a stake amount in HSK as a plain decimal (e.g. 1000 or 1500.5). No scientific notation.",
        "error",
      );
      return;
    }
    const stakeNum = Number(form.stakeAmount);
    if (!Number.isFinite(stakeNum) || stakeNum < 0) {
      toast("Stake amount must be a non-negative number.", "error");
      return;
    }
    if (stakeNum > 10_000_000) {
      toast("Stake amount looks unreasonably large — double-check the value.", "error");
      return;
    }
    if (KYC_METHODS_REQUIRING_NOTES.has(form.kycMethod) && form.kycMethodNotes.trim().length < 10) {
      toast(`kycMethod "${form.kycMethod}" requires a notes field of at least 10 characters.`, "error");
      return;
    }
    if (!connected || !address) {
      toast("Connect your wallet first.", "error");
      return;
    }

    // Second-confirmation gate for non-trivial stakes. KYC Provider tier is
    // 1000 HSK; Institutional is 10000 HSK. Below that (Community) is allowed
    // through without the modal. Above the upper threshold we require typing
    // the amount a second time.
    const tier = stakeNum >= 10_000 ? "Institutional" : stakeNum >= 1_000 ? "KYC Provider" : "Community";
    if (stakeNum >= 1_000) {
      const ok = window.confirm(
        `You are about to stake ${stakeNum} HSK on HashKey Chain mainnet (chain 177).\n\n` +
          `Tier: ${tier}\n` +
          `Destination: ${MAINNET_ADDRESSES.issuerRegistry}\n` +
          `Stake is locked for 7 days after requestUnstake().\n` +
          `Partial withdrawal is not supported.\n\n` +
          `Continue?`,
      );
      if (!ok) {
        toast("Stake cancelled.", "info");
        return;
      }
    }
    if (stakeNum >= 10_000) {
      const typed = window.prompt(
        `Type the exact stake amount again to confirm:\n${stakeNum} HSK`,
      );
      if (typed?.trim() !== String(stakeNum)) {
        toast("Stake amount confirmation failed — cancelled.", "error");
        return;
      }
    }

    setSubmitting(true);
    setTx(null);
    try {
      const { signer, address: current } = await connectWallet("mainnet");
      if (current.toLowerCase() !== address.toLowerCase()) {
        toast(
          `Wallet account changed during the flow. Was ${address.slice(0, 6)}…, now ${current.slice(0, 6)}…. Reconnect and try again.`,
          "error",
        );
        return;
      }
      // Refuse to spend more than wallet balance minus a generous gas reserve.
      // Prevents "stake amount exceeds balance" reverts that still cost gas.
      const value = parseEther(form.stakeAmount);
      const balance = await signer.provider.getBalance(current);
      const gasReserve = parseEther("0.01");
      if (value + gasReserve > balance) {
        toast(
          `Insufficient balance. You have ${(Number(balance) / 1e18).toFixed(4)} HSK; need ${form.stakeAmount} + ~0.01 HSK gas.`,
          "error",
        );
        return;
      }
      const reg = new Contract(MAINNET_ADDRESSES.issuerRegistry, ISSUER_REGISTRY_ABI, signer);
      const txn = await reg.stakeAndRegister(uri, { value });
      toast("Transaction submitted, waiting for confirmation…", "info");
      setTx(txn.hash);
      const receipt = await txn.wait();
      if (receipt?.status === 1) {
        toast("Staked successfully — you appear in /issuers shortly.", "success");
      } else {
        toast("Transaction reverted on-chain.", "error");
      }
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 200) ?? "stake failed";
      toast(`Stake failed: ${msg}`, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="mb-10">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="inline-block px-3 py-1 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
            Issuer onboarding
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono text-emerald-300 border border-emerald-700 rounded-full bg-emerald-950/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            mainnet
          </span>
        </div>
        <h1 className="text-4xl font-bold mb-3">Become an HSK Passport issuer</h1>
        <p className="text-gray-400 text-lg max-w-3xl">
          Stake native HSK on{" "}
          <a
            href={`${MAINNET_EXPLORER_URL}/address/${MAINNET_ADDRESSES.issuerRegistry}`}
            target="_blank"
            rel="noreferrer"
            className="text-purple-400 hover:underline"
          >
            HashKey Chain mainnet IssuerRegistry
          </a>
          , publish your metadata, and start issuing credentials. Your tier (Community / KYC Provider / Institutional) is determined automatically by stake size. Misissuance is slashable via 48-hour governance Timelock. Credentials and KYC continue to issue on testnet pending third-party audit.
        </p>
      </div>

      {/* Honest disclosure: registry owner is still an EOA today, not the
          Timelock the marketing copy implies. Slashing+ownership transfer to
          a Safe + 48h Timelock is roadmap Q3 — until then, stake at your own
          risk. Don't bury this. */}
      <div className="mb-8 rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <div>
            <div className="font-semibold text-amber-200 mb-1">Soft-mainnet — owner is an EOA today</div>
            <div className="text-amber-100/80 leading-relaxed">
              The IssuerRegistry on mainnet is owned by a deployer EOA{" "}
              <code className="px-1 py-0.5 rounded bg-black/30 text-xs">0x0b17…50DF</code>, not yet a Safe + 48h Timelock.
              Migration to multi-sig governance is planned for Q3 2026. If the deployer key is compromised before then,
              <code className="px-1 py-0.5 mx-0.5 rounded bg-black/30 text-xs">slash()</code> can be called without delay.
              Stake at your own risk — the Timelock copy below describes the post-migration end state.
            </div>
          </div>
        </div>
      </div>

      <section className="mb-10 grid gap-4 md:grid-cols-3">
        <Tier
          name="Community"
          stake="0 HSK"
          description="Limited groups, public sandbox issuance. Best for hackathon entries, research projects, demo issuers."
          highlighted={tier === 1}
        />
        <Tier
          name="KYC Provider"
          stake="≥ 1,000 HSK"
          description="Full credential issuance, reputation tracked publicly, eligible for production dApp integrations."
          highlighted={tier === 2}
        />
        <Tier
          name="Institutional"
          stake="≥ 10,000 HSK"
          description="All KYC Provider rights plus institutional credential types and direct dApp listing priority."
          highlighted={tier === 3}
        />
      </section>

      <Steps step={step} setStep={setStep} />

      {step === "build" && (
        <section className="border border-gray-800 rounded-xl p-6 bg-gray-950/40 space-y-5">
          <h2 className="text-xl font-semibold mb-1">1 · Build your metadata</h2>
          <p className="text-sm text-gray-400">
            On-chain we store your stake, tier, and reputation. Off-chain at your{" "}
            <code className="px-1 py-0.5 rounded bg-black/40 text-xs">metadataURI</code> we expect this JSON shape (
            <a
              href="https://github.com/Ridwannurudeen/hsk-passport/blob/main/schemas/Issuer.json"
              target="_blank"
              rel="noreferrer"
              className="text-purple-400 hover:underline"
            >
              Issuer.json schema
            </a>
            ). Fill the form below; the JSON updates live.
          </p>

          <Input label="Operating name" value={form.name} onChange={(v) => update("name", v)} placeholder="Acme KYC Ltd" />
          <Input label="Website" value={form.website} onChange={(v) => update("website", v)} placeholder="https://acme-kyc.example" />
          <Input label="Compliance contact email" value={form.email} onChange={(v) => update("email", v)} placeholder="compliance@acme-kyc.example" />

          <div>
            <Label>KYC method</Label>
            <select
              className="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              value={form.kycMethod}
              onChange={(e) => update("kycMethod", e.target.value as FormState["kycMethod"])}
            >
              {KYC_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {(form.kycMethod === "in-house" || form.kycMethod === "other") && (
              <Input
                label=""
                value={form.kycMethodNotes}
                onChange={(v) => update("kycMethodNotes", v)}
                placeholder="Brief description of your verification process"
              />
            )}
          </div>

          <Input
            label="Jurisdictions (comma-separated ISO codes)"
            value={form.jurisdictions}
            onChange={(v) => update("jurisdictions", v.toUpperCase())}
            placeholder="HK, SG, AE, GB"
          />

          <div>
            <Label>Supported credential types</Label>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_CREDENTIAL_TYPES.map((t) => {
                const active = form.supportedCredentials.has(t);
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => toggleCred(t)}
                    className={`px-3 py-1 text-xs rounded border transition-colors ${
                      active
                        ? "bg-purple-600/30 border-purple-500 text-purple-100"
                        : "bg-black/30 border-gray-700 text-gray-300 hover:border-gray-600"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Final issuance authority is on-chain via <code>HSKPassport.approveIssuer</code> + delegate assignment per group.
            </p>
          </div>

          <div>
            <Label>Key custody (recommended)</Label>
            <select
              className="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              value={form.keyCustody}
              onChange={(e) => update("keyCustody", e.target.value as FormState["keyCustody"])}
            >
              <option value="">— select —</option>
              {KEY_CUSTODY_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              KYC Provider tier should use HSM, MPC, or multisig. <code>hot-wallet</code> is only acceptable for Community tier.
            </p>
          </div>

          <div className="border-t border-gray-800 pt-4">
            <Label>Generated metadata.json</Label>
            <pre className="bg-black/60 border border-gray-800 rounded-lg p-3 text-[11px] font-mono overflow-x-auto max-h-64 text-gray-300">
              {generatedJSON}
            </pre>
            <button
              type="button"
              onClick={copyJSON}
              className="mt-2 px-3 py-1.5 text-xs rounded border border-gray-700 hover:border-gray-600"
            >
              Copy JSON
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setStep("host")}
              className="px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
            >
              Next: host metadata →
            </button>
          </div>
        </section>
      )}

      {step === "host" && (
        <section className="border border-gray-800 rounded-xl p-6 bg-gray-950/40 space-y-4">
          <h2 className="text-xl font-semibold mb-1">2 · Host your metadata</h2>
          <p className="text-sm text-gray-400">
            Host the JSON at a stable URL. Two recommended paths:
          </p>
          <ul className="text-sm text-gray-300 space-y-2 list-disc pl-5">
            <li>
              <strong>HTTPS</strong> on your own domain — e.g. <code>https://acme-kyc.example/.well-known/hsk-issuer.json</code>. Fast, but you control the host.
            </li>
            <li>
              <strong>IPFS</strong> via Pinata, web3.storage, or your own node — e.g. <code>ipfs://bafy…</code>. Content-addressed; harder to silently change.
            </li>
          </ul>
          <p className="text-sm text-gray-400">
            The directory backend fetches with a 5s timeout, validates the schema, caches for 10 minutes. CORS is not required.
          </p>

          <div className="pt-2">
            <Input
              label="Your metadata URI (paste once hosted)"
              value={form.metadataURI}
              onChange={(v) => update("metadataURI", v.trim())}
              placeholder="https://acme-kyc.example/.well-known/hsk-issuer.json"
            />
          </div>

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep("build")}
              className="px-4 py-2 text-sm rounded-lg border border-gray-700 hover:border-gray-600"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setStep("stake")}
              disabled={!form.metadataURI}
              className="px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next: stake →
            </button>
          </div>
        </section>
      )}

      {step === "stake" && (
        <section className="border border-gray-800 rounded-xl p-6 bg-gray-950/40 space-y-4">
          <h2 className="text-xl font-semibold mb-1">3 · Stake and register</h2>
          <p className="text-sm text-gray-400">
            Connect your wallet and call <code>stakeAndRegister(metadataURI)</code> with native HSK as <code>msg.value</code>. This single transaction registers you and assigns your tier based on stake.
          </p>

          {!connected ? (
            <button
              type="button"
              onClick={handleConnect}
              className="px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 text-white"
            >
              Connect wallet
            </button>
          ) : (
            <div className="text-xs text-gray-400 font-mono">
              Connected: {address}
            </div>
          )}

          <Input
            label="Stake amount (HSK)"
            value={form.stakeAmount}
            onChange={(v) => update("stakeAmount", v)}
            placeholder="1000"
          />
          {form.stakeAmount && (
            <div className="text-xs text-gray-400">
              Tier at this stake: <span className="text-purple-300 font-medium">{ISSUER_TIER_NAMES[tier]}</span>
            </div>
          )}

          <div className="border-t border-gray-800 pt-3 text-xs text-gray-500 space-y-1">
            <div>metadataURI: <span className="text-gray-300 break-all">{form.metadataURI || "—"}</span></div>
            <div>7-day cooldown applies on unstake. Unstake is only available in full; partial withdrawal not supported.</div>
          </div>

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep("host")}
              className="px-4 py-2 text-sm rounded-lg border border-gray-700 hover:border-gray-600"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleStake}
              disabled={submitting || !connected || !form.metadataURI || !form.stakeAmount}
              className="px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Submitting…" : "Stake and register"}
            </button>
          </div>

          {tx && (
            <div className="text-xs text-gray-400 pt-3 border-t border-gray-800">
              Transaction:{" "}
              <a
                href={`${MAINNET_EXPLORER_URL}/tx/${tx}`}
                target="_blank"
                rel="noreferrer"
                className="text-purple-400 hover:underline font-mono"
              >
                {tx.slice(0, 10)}…{tx.slice(-8)}
              </a>
            </div>
          )}
        </section>
      )}

      <div className="mt-10 text-center text-sm text-gray-500">
        <Link href="/issuers" className="text-purple-400 hover:underline">
          ← Back to issuer directory
        </Link>
      </div>
    </div>
  );
}

function Tier({
  name,
  stake,
  description,
  highlighted,
}: {
  name: string;
  stake: string;
  description: string;
  highlighted: boolean;
}) {
  return (
    <div
      className={`border rounded-xl p-5 transition-colors ${
        highlighted
          ? "border-purple-500 bg-purple-950/30"
          : "border-gray-800 bg-gray-950/40"
      }`}
    >
      <div className="text-xs uppercase tracking-wider opacity-70 mb-1">{name}</div>
      <div className="text-lg font-semibold mb-2">{stake}</div>
      <p className="text-xs text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}

function Steps({
  step,
  setStep,
}: {
  step: "build" | "host" | "stake";
  setStep: (s: "build" | "host" | "stake") => void;
}) {
  const steps: Array<{ key: "build" | "host" | "stake"; label: string }> = [
    { key: "build", label: "Build metadata" },
    { key: "host", label: "Host metadata" },
    { key: "stake", label: "Stake and register" },
  ];
  return (
    <div className="flex items-center justify-center gap-1 mb-6 text-xs font-mono">
      {steps.map((s, i) => (
        <button
          type="button"
          key={s.key}
          onClick={() => setStep(s.key)}
          className={`px-3 py-1.5 rounded transition-colors ${
            step === s.key
              ? "bg-purple-600/30 text-purple-200 border border-purple-600/50"
              : "text-gray-500 hover:text-gray-300 border border-transparent"
          }`}
        >
          {i + 1}. {s.label}
        </button>
      ))}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs uppercase tracking-wider text-gray-400 mb-1.5">{children}</div>;
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input
        className="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function tierForStake(amount: string): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n >= 10000) return 3;
  if (n >= 1000) return 2;
  return 1;
}

function buildMetadataJSON(form: FormState): string {
  const jurisdictions = form.jurisdictions
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{2}$/.test(s));

  const out: Record<string, unknown> = {
    name: form.name || "",
    contact: { email: form.email || "" },
    kycMethod: form.kycMethod,
    jurisdictions,
    publishedAt: new Date().toISOString(),
  };

  if (form.website) out.website = form.website;
  if ((form.kycMethod === "in-house" || form.kycMethod === "other") && form.kycMethodNotes) {
    out.kycMethodNotes = form.kycMethodNotes;
  }
  if (form.supportedCredentials.size > 0) {
    out.supportedCredentials = Array.from(form.supportedCredentials);
  }
  if (form.keyCustody) {
    out.operationalSecurity = { keyCustody: form.keyCustody };
  }

  return JSON.stringify(out, null, 2);
}
