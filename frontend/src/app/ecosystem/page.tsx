"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ADDRESSES, EXPLORER_URL, GROUPS } from "@/lib/contracts";
import { apiGetGlobalStats, type GlobalStats } from "@/lib/api";

interface EcosystemApp {
  name: string;
  symbol: string;
  tag: string;
  description: string;
  address: string;
  requiredCredential: string;
  requiredGroupId: number;
  action: string;
  demoUrl?: string;
  color: string;
}

const APPS: EcosystemApp[] = [
  {
    name: "HashKey Silver Token",
    symbol: "hSILVER",
    tag: "Real World Asset",
    description: "Regulated silver-backed token for KYC-verified users. Mint 100 hSILVER per credential — one-time per identity.",
    address: ADDRESSES.gatedRWA,
    requiredCredential: "KYC Verified",
    requiredGroupId: GROUPS.KYC_VERIFIED,
    action: "kycMint(proof)",
    demoUrl: "/demo",
    color: "from-gray-700 to-gray-600",
  },
  {
    name: "HashKey Pilot Airdrop",
    symbol: "hPILOT",
    tag: "Sybil-resistant Airdrop",
    description: "Per-identity airdrop with action-scoped nullifiers. One claim per round per identity — resistant to sybil attacks without revealing addresses.",
    address: ADDRESSES.kycGatedAirdrop,
    requiredCredential: "KYC Verified",
    requiredGroupId: GROUPS.KYC_VERIFIED,
    action: "claim(proof)",
    color: "from-purple-900 to-purple-700",
  },
  {
    name: "Accredited Lending Pool",
    symbol: "—",
    tag: "DeFi",
    description: "Dual-tier lending: retail capped at 10 ETH, accredited uncapped. Borrow above threshold requires ACCREDITED_INVESTOR ZK proof — compliant with regulatory thresholds.",
    address: ADDRESSES.kycGatedLending,
    requiredCredential: "Accredited Investor",
    requiredGroupId: GROUPS.ACCREDITED_INVESTOR,
    action: "borrowAccredited(amount, proof)",
    color: "from-green-900 to-emerald-700",
  },
];

export default function EcosystemPage() {
  const [stats, setStats] = useState<GlobalStats | null>(null);

  useEffect(() => {
    apiGetGlobalStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <div className="inline-block px-3 py-1 mb-4 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
          {APPS.length} dApps integrated
        </div>
        <h1 className="text-4xl font-bold mb-3">Ecosystem</h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          HSK Passport is composable. One credential, verified across the entire HashKey Chain ecosystem — with no personal data on-chain.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-purple-300">{stats.activeCredentials}</div>
            <div className="text-xs text-gray-500">Active credentials</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-purple-300">{stats.activeGroups}</div>
            <div className="text-xs text-gray-500">Credential groups</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-purple-300">{APPS.length}</div>
            <div className="text-xs text-gray-500">Integrated dApps</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-purple-300">{stats.kycRequests}</div>
            <div className="text-xs text-gray-500">KYC submissions</div>
          </div>
        </div>
      )}

      {/* Apps grid */}
      <div className="grid gap-6 mb-16">
        {APPS.map((app) => (
          <div key={app.address} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-purple-800/50 transition-colors">
            <div className={`h-2 bg-gradient-to-r ${app.color}`} />
            <div className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold">{app.name}</h3>
                    {app.symbol !== "—" && (
                      <span className="text-xs font-mono text-purple-400 px-2 py-0.5 bg-purple-950/30 rounded">{app.symbol}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{app.tag}</div>
                </div>
                <span className="shrink-0 text-xs px-2 py-1 bg-green-900/30 text-green-400 border border-green-800/50 rounded">
                  Live on testnet
                </span>
              </div>

              <p className="text-sm text-gray-300 mb-5">{app.description}</p>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs mb-5">
                <div>
                  <dt className="text-gray-500 mb-0.5">Required credential</dt>
                  <dd className="text-purple-300">{app.requiredCredential} (group {app.requiredGroupId})</dd>
                </div>
                <div>
                  <dt className="text-gray-500 mb-0.5">Entry point</dt>
                  <dd className="font-mono text-gray-300">{app.action}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-gray-500 mb-0.5">Contract address</dt>
                  <dd className="font-mono text-gray-300 break-all">
                    <a href={`${EXPLORER_URL}/address/${app.address}`} target="_blank" rel="noopener noreferrer" className="hover:text-purple-300">
                      {app.address}
                    </a>
                  </dd>
                </div>
              </dl>

              <div className="flex gap-3">
                <a
                  href={`${EXPLORER_URL}/address/${app.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm rounded-lg transition-colors"
                >
                  View on Explorer
                </a>
                {app.demoUrl && (
                  <Link
                    href={app.demoUrl}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-sm text-white rounded-lg transition-colors"
                  >
                    Try Demo
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA to integrate */}
      <div className="bg-gradient-to-br from-purple-950/30 to-gray-900 border border-purple-800/50 rounded-2xl p-8 text-center">
        <h2 className="text-2xl font-bold mb-3">Add your dApp</h2>
        <p className="text-gray-400 mb-6 max-w-xl mx-auto">
          Any HashKey Chain dApp can gate access behind a ZK credential check. Inherit HSKPassportVerifier, add one modifier, ship. No KYC integration code required.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/developers"
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
          >
            Developer Docs
          </Link>
          <a
            href="https://github.com/Ridwannurudeen/hsk-passport"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 border border-gray-700 hover:border-gray-500 text-gray-300 font-medium rounded-lg transition-colors"
          >
            View Source
          </a>
        </div>
      </div>
    </div>
  );
}
