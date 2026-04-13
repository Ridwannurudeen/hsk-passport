"use client";

import { useState, useMemo } from "react";
import { ADDRESSES, GROUPS } from "@/lib/contracts";

type Jurisdiction = "HK" | "SG" | "AE";

const JURISDICTION_GROUP: Record<Jurisdiction, number> = {
  HK: GROUPS.HK_RESIDENT,
  SG: GROUPS.SG_RESIDENT,
  AE: GROUPS.AE_RESIDENT,
};

export default function ComposerPage() {
  const [requireKyc, setRequireKyc] = useState(true);
  const [requireAccredited, setRequireAccredited] = useState(false);
  const [jurisdictions, setJurisdictions] = useState<Set<Jurisdiction>>(new Set());
  const [dappName, setDappName] = useState("MyApp");
  const [actionScope, setActionScope] = useState("my-dapp:mint");
  const [copied, setCopied] = useState<string>("");
  const [activePreset, setActivePreset] = useState<string>("");

  type Preset = {
    id: string;
    name: string;
    desc: string;
    apply: () => void;
  };

  const presets: Preset[] = [
    {
      id: "rwa-allowlist",
      name: "Private RWA Allowlist",
      desc: "KYC-gated regulated RWA mint (e.g. tokenized silver, tokenized treasuries). Caller-bound, anonymous.",
      apply: () => {
        setRequireKyc(true);
        setRequireAccredited(false);
        setJurisdictions(new Set());
        setDappName("PrivateRWAToken");
        setActionScope("private-rwa:mint");
      },
    },
    {
      id: "accredited-pool",
      name: "Accredited DeFi Pool",
      desc: "KYC + accredited-investor proof. For tokenized funds, undercollateralized lending, and institutional DeFi.",
      apply: () => {
        setRequireKyc(true);
        setRequireAccredited(true);
        setJurisdictions(new Set());
        setDappName("AccreditedPool");
        setActionScope("accredited-pool:enter");
      },
    },
    {
      id: "regional-rwa",
      name: "APAC Regional RWA",
      desc: "KYC + jurisdiction proof from {HK, SG, AE} — selective disclosure (verifier learns set membership only).",
      apply: () => {
        setRequireKyc(true);
        setRequireAccredited(false);
        setJurisdictions(new Set(["HK", "SG", "AE"]));
        setDappName("APACSilverPool");
        setActionScope("apac-silver:mint");
      },
    },
    {
      id: "institutional",
      name: "Institutional Tier",
      desc: "Full stack: KYC + accreditation + APAC residency. Models a regulated institutional product.",
      apply: () => {
        setRequireKyc(true);
        setRequireAccredited(true);
        setJurisdictions(new Set(["HK", "SG", "AE"]));
        setDappName("InstitutionalVault");
        setActionScope("institutional:deposit");
      },
    },
  ];

  function applyPreset(p: Preset) {
    p.apply();
    setActivePreset(p.id);
    setTimeout(() => setActivePreset(""), 1500);
  }

  function toggleJurisdiction(j: Jurisdiction) {
    const next = new Set(jurisdictions);
    if (next.has(j)) next.delete(j);
    else next.add(j);
    setJurisdictions(next);
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  const solidity = useMemo(() => {
    const lines: string[] = [];
    lines.push(`// SPDX-License-Identifier: MIT`);
    lines.push(`pragma solidity ^0.8.24;`);
    lines.push(``);
    lines.push(`import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";`);
    lines.push(``);
    lines.push(`interface IHSKPassport {`);
    lines.push(`    function verifyCredential(uint256 groupId, ISemaphore.SemaphoreProof calldata proof) external view returns (bool);`);
    lines.push(`}`);
    if (jurisdictions.size > 0) {
      lines.push(``);
      lines.push(`interface IJurisdictionSetVerifier {`);
      lines.push(`    function verifyAny(uint256[] calldata groupIds, ISemaphore.SemaphoreProof calldata proof) external view returns (bool);`);
      lines.push(`}`);
    }
    lines.push(``);
    lines.push(`contract ${dappName}Gated {`);
    lines.push(`    IHSKPassport public constant PASSPORT = IHSKPassport(${ADDRESSES.hskPassport});`);
    if (jurisdictions.size > 0) {
      lines.push(`    IJurisdictionSetVerifier public constant JURISDICTIONS = IJurisdictionSetVerifier(${ADDRESSES.jurisdictionSetVerifier});`);
    }
    lines.push(``);
    lines.push(`    error NotKYCVerified();`);
    if (requireAccredited) lines.push(`    error NotAccredited();`);
    if (jurisdictions.size > 0) lines.push(`    error JurisdictionNotAllowed();`);
    lines.push(`    error ProofNotCallerBound();`);
    lines.push(``);
    lines.push(`    /// Gate entry point. Enforces the composed policy.`);
    lines.push(`    function gatedAction(ISemaphore.SemaphoreProof calldata proof) external {`);
    lines.push(`        // 1. Caller-bound proof — prevents front-running.`);
    lines.push(`        if (proof.message != uint256(uint160(msg.sender))) revert ProofNotCallerBound();`);
    lines.push(``);
    if (requireKyc) {
      lines.push(`        // 2. KYC verification required.`);
      lines.push(`        if (!PASSPORT.verifyCredential(${GROUPS.KYC_VERIFIED}, proof)) revert NotKYCVerified();`);
      lines.push(``);
    }
    if (requireAccredited) {
      lines.push(`        // 3. Accredited investor required.`);
      lines.push(`        if (!PASSPORT.verifyCredential(${GROUPS.ACCREDITED_INVESTOR}, proof)) revert NotAccredited();`);
      lines.push(``);
    }
    if (jurisdictions.size > 0) {
      const groupIds = Array.from(jurisdictions).map((j) => JURISDICTION_GROUP[j]);
      lines.push(`        // ${requireKyc || requireAccredited ? "4" : "2"}. Jurisdiction must be one of: ${Array.from(jurisdictions).join(", ")}.`);
      lines.push(`        uint256[] memory allowedGroups = new uint256[](${groupIds.length});`);
      groupIds.forEach((gid, i) => lines.push(`        allowedGroups[${i}] = ${gid};`));
      lines.push(`        if (!JURISDICTIONS.verifyAny(allowedGroups, proof)) revert JurisdictionNotAllowed();`);
      lines.push(``);
    }
    lines.push(`        // Policy satisfied — run your action below.`);
    lines.push(`        _onApproved(msg.sender);`);
    lines.push(`    }`);
    lines.push(``);
    lines.push(`    function _onApproved(address user) internal virtual {`);
    lines.push(`        // Override: mint, borrow, airdrop, etc.`);
    lines.push(`    }`);
    lines.push(`}`);
    return lines.join("\n");
  }, [requireKyc, requireAccredited, jurisdictions, dappName]);

  const react = useMemo(() => {
    const groupIds = Array.from(jurisdictions).map((j) => JURISDICTION_GROUP[j]);
    return `"use client";
import { HSKPassportGate } from "hsk-passport-sdk/react";

export function ${dappName}Action() {
  return (
    <HSKPassportGate
      policy={{
        kyc: ${requireKyc},
        accredited: ${requireAccredited},
        jurisdictions: [${groupIds.join(", ")}],
        scope: "${actionScope}",
      }}
      onProof={async (proof) => {
        // Call your gated contract
        const tx = await contract.gatedAction(proof);
        await tx.wait();
      }}
    >
      <button className="btn-primary">Execute ${dappName} Action</button>
    </HSKPassportGate>
  );
}`;
  }, [requireKyc, requireAccredited, jurisdictions, dappName, actionScope]);

  const test = useMemo(() => {
    return `import { expect } from "chai";
import { ethers } from "hardhat";
import { buildProof } from "hsk-passport-sdk/test";

describe("${dappName}Gated", () => {
  it("rejects unapproved users", async () => {
    const [, attacker] = await ethers.getSigners();
    const fakeProof = await buildProof({ identity: attacker, message: attacker.address });
    await expect(gated.connect(attacker).gatedAction(fakeProof))
      .to.be.revertedWithCustomError(gated, "${requireKyc ? "NotKYCVerified" : requireAccredited ? "NotAccredited" : "JurisdictionNotAllowed"}");
  });

  it("accepts users with the full policy", async () => {
    const proof = await buildProof({
      identity: alice,
      message: alice.address,
      scope: "${actionScope}",
      groups: [${[
        requireKyc ? GROUPS.KYC_VERIFIED : null,
        requireAccredited ? GROUPS.ACCREDITED_INVESTOR : null,
        ...Array.from(jurisdictions).map((j) => JURISDICTION_GROUP[j]),
      ].filter((x) => x !== null).join(", ")}],
    });
    await expect(gated.connect(alice).gatedAction(proof)).to.not.be.reverted;
  });
});`;
  }, [requireKyc, requireAccredited, jurisdictions, dappName, actionScope]);

  const rulesSummary = useMemo(() => {
    const parts: string[] = [];
    if (requireKyc) parts.push("KYC");
    if (requireAccredited) parts.push("Accredited");
    if (jurisdictions.size > 0) parts.push(`Jurisdiction ∈ {${Array.from(jurisdictions).join(", ")}}`);
    return parts.length ? parts.join(" && ") : "No rules selected";
  }, [requireKyc, requireAccredited, jurisdictions]);

  const hasAnyRule = requireKyc || requireAccredited || jurisdictions.size > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8">
        <div className="inline-block px-3 py-1 mb-3 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
          Policy Composer
        </div>
        <h1 className="text-4xl font-bold mb-3">Compliance Policy Composer</h1>
        <p className="text-lg text-gray-400 max-w-2xl">
          Pick the compliance rules your dApp needs. We&apos;ll generate the Solidity contract, React component, and test file. Paste into your project and you&apos;re done.
        </p>
      </div>

      {/* Presets — judge-facing one-click templates */}
      <div className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Start from a preset</h2>
          <span className="text-xs text-gray-500">or build a custom policy below ↓</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className={`text-left bg-gray-900 hover:bg-gray-800/80 border rounded-xl p-4 transition-all ${
                activePreset === p.id ? "border-purple-500 ring-2 ring-purple-500/30" : "border-gray-800 hover:border-purple-700"
              }`}
            >
              <div className="text-sm font-semibold text-white mb-1.5">{p.name}</div>
              <div className="text-xs text-gray-400 leading-snug">{p.desc}</div>
              {activePreset === p.id && (
                <div className="text-xs text-purple-400 mt-2">✓ Loaded</div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-6">
        {/* Policy builder */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-4">Policy</h2>

            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-1">dApp name</label>
              <input
                value={dappName}
                onChange={(e) => setDappName(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-1">Action scope</label>
              <input
                value={actionScope}
                onChange={(e) => setActionScope(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:border-purple-500 focus:outline-none"
                placeholder="my-dapp:mint"
              />
              <p className="text-xs text-gray-600 mt-1">Unique per-action namespace for sybil resistance.</p>
            </div>

            <div className="space-y-3 mt-4 pt-4 border-t border-gray-800">
              <h3 className="text-xs uppercase text-gray-500 font-semibold">Required credentials</h3>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireKyc}
                  onChange={(e) => setRequireKyc(e.target.checked)}
                  className="mt-1 accent-purple-500"
                />
                <div>
                  <div className="text-sm font-medium">KYC Verified</div>
                  <div className="text-xs text-gray-500">User has passed standard KYC (group {GROUPS.KYC_VERIFIED})</div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireAccredited}
                  onChange={(e) => setRequireAccredited(e.target.checked)}
                  className="mt-1 accent-purple-500"
                />
                <div>
                  <div className="text-sm font-medium">Accredited Investor</div>
                  <div className="text-xs text-gray-500">Professional / qualified investor (group {GROUPS.ACCREDITED_INVESTOR})</div>
                </div>
              </label>
            </div>

            <div className="space-y-3 mt-4 pt-4 border-t border-gray-800">
              <h3 className="text-xs uppercase text-gray-500 font-semibold">Allowed jurisdictions</h3>
              <p className="text-xs text-gray-600 -mt-2">Selective disclosure — prove membership in the set without revealing which one.</p>

              {(["HK", "SG", "AE"] as Jurisdiction[]).map((j) => (
                <label key={j} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={jurisdictions.has(j)}
                    onChange={() => toggleJurisdiction(j)}
                    className="accent-purple-500"
                  />
                  <div className="text-sm">
                    {j === "HK" ? "Hong Kong" : j === "SG" ? "Singapore" : "UAE"}
                    <span className="text-xs text-gray-600 ml-2">(group {JURISDICTION_GROUP[j]})</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-950/40 to-gray-900 border border-purple-800/50 rounded-xl p-4">
            <div className="text-xs text-purple-300 font-semibold uppercase mb-1">Policy expression</div>
            <code className="text-sm font-mono text-gray-200 block break-words">{rulesSummary}</code>
          </div>
        </div>

        {/* Generated outputs */}
        <div className="space-y-4">
          {!hasAnyRule ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center text-sm text-gray-500">
              Select at least one rule to generate code.
            </div>
          ) : (
            <>
              <OutputBlock
                title="Solidity contract"
                subtitle="Paste into your project — enforces the policy on every call."
                language="solidity"
                code={solidity}
                filename={`${dappName}Gated.sol`}
                onCopy={() => copy(solidity, "solidity")}
                copied={copied === "solidity"}
              />
              <OutputBlock
                title="React frontend"
                subtitle="Drop into any page — handles proof generation + submission."
                language="tsx"
                code={react}
                filename={`${dappName}Action.tsx`}
                onCopy={() => copy(react, "react")}
                copied={copied === "react"}
              />
              <OutputBlock
                title="Hardhat test"
                subtitle="Starter test — verifies the policy rejects attackers and accepts valid users."
                language="ts"
                code={test}
                filename={`${dappName}Gated.test.ts`}
                onCopy={() => copy(test, "test")}
                copied={copied === "test"}
              />
            </>
          )}
        </div>
      </div>

      <div className="mt-10 bg-gray-900/50 border border-gray-800 rounded-xl p-5 text-sm text-gray-400">
        <strong className="text-white">How it works:</strong> Your contract calls into the deployed{" "}
        <code className="text-purple-300">HSKPassport</code> verifier at{" "}
        <code className="text-purple-300 font-mono text-xs">{ADDRESSES.hskPassport}</code>. Users generate zero-knowledge proofs in-browser that satisfy your policy without revealing their identity. Each proof is caller-bound to prevent front-running and scoped per-action for sybil resistance.
      </div>
    </div>
  );
}

function OutputBlock({
  title,
  subtitle,
  language,
  code,
  filename,
  onCopy,
  copied,
}: {
  title: string;
  subtitle: string;
  language: string;
  code: string;
  filename: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-950/50">
        <div>
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-gray-500">{subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono">{filename}</span>
          <button
            onClick={onCopy}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
              copied ? "bg-green-600 text-white" : "bg-purple-600 hover:bg-purple-500 text-white"
            }`}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="p-5 text-xs font-mono text-gray-300 overflow-x-auto max-h-96">
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}
