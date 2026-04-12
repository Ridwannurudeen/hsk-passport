"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiGetGlobalStats, type GlobalStats } from "@/lib/api";

export default function Home() {
  const [stats, setStats] = useState<GlobalStats | null>(null);

  useEffect(() => {
    apiGetGlobalStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-950/30 via-gray-950 to-gray-950 pointer-events-none" />
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
          backgroundImage: "radial-gradient(circle at 30% 20%, rgba(147,51,234,0.15), transparent 50%)",
        }} />

        <div className="relative max-w-6xl mx-auto px-4 py-20 text-center">
          <div className="inline-block px-3 py-1 mb-6 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
            Compliance layer for HashKey regulated RWA + institutional DeFi
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            Verify once.
            <br />
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Prove anywhere. Reveal nothing.
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            Every regulated product on HashKey needs compliance, but today that means leaking identity or rebuilding KYC for every app. HSK Passport is a reusable privacy layer: extend HashKey&apos;s KYC + DID stack, verify once, prove anywhere on-chain, reveal nothing.
          </p>
          <div className="flex flex-wrap gap-3 justify-center mb-12">
            <Link
              href="/kyc"
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
            >
              Get Verified
            </Link>
            <Link
              href="/developers"
              className="px-6 py-3 bg-gray-900 border border-gray-700 hover:border-gray-500 text-gray-100 font-medium rounded-lg transition-colors"
            >
              Build with HSK Passport
            </Link>
            <Link
              href="/demo"
              className="px-6 py-3 border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-gray-200 font-medium rounded-lg transition-colors"
            >
              Try Demo
            </Link>
          </div>

          {/* Live stats from indexer */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4">
                <div className="text-3xl font-bold text-purple-300">{stats.activeCredentials}</div>
                <div className="text-xs text-gray-500 mt-1">Active credentials</div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4">
                <div className="text-3xl font-bold text-purple-300">3</div>
                <div className="text-xs text-gray-500 mt-1">Credential types</div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4">
                <div className="text-3xl font-bold text-purple-300">3</div>
                <div className="text-xs text-gray-500 mt-1">Integrated dApps</div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4">
                <div className="text-3xl font-bold text-purple-300">0</div>
                <div className="text-xs text-gray-500 mt-1">Bytes PII on-chain</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* For 3 audiences */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Built for three sides of the market</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center text-lg font-bold mb-4">U</div>
            <h3 className="text-xl font-bold mb-2">Users</h3>
            <p className="text-sm text-gray-400 mb-4">Verify once. Use everywhere. Never expose personal data on-chain.</p>
            <ul className="text-xs text-gray-500 space-y-1 mb-4">
              <li>• One KYC, reusable across dApps</li>
              <li>• Zero personal data on blockchain</li>
              <li>• Revocable, expirable credentials</li>
            </ul>
            <Link href="/kyc" className="text-sm text-blue-400 hover:text-blue-300">Get verified →</Link>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg font-bold mb-4">D</div>
            <h3 className="text-xl font-bold mb-2">dApp Developers</h3>
            <p className="text-sm text-gray-400 mb-4">One modifier. Any function gated behind ZK compliance checks.</p>
            <ul className="text-xs text-gray-500 space-y-1 mb-4">
              <li>• One-line Solidity integration</li>
              <li>• TypeScript SDK + React component</li>
              <li>• Indexer API for fast member queries</li>
            </ul>
            <Link href="/developers" className="text-sm text-purple-400 hover:text-purple-300">Developer docs →</Link>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="w-10 h-10 rounded-lg bg-green-600/20 text-green-400 flex items-center justify-center text-lg font-bold mb-4">I</div>
            <h3 className="text-xl font-bold mb-2">Issuers</h3>
            <p className="text-sm text-gray-400 mb-4">Review KYC submissions, issue revocable credentials on-chain.</p>
            <ul className="text-xs text-gray-500 space-y-1 mb-4">
              <li>• Queue of pending submissions</li>
              <li>• Approve/reject with audit log</li>
              <li>• Schema registry for credential types</li>
            </ul>
            <Link href="/issuer" className="text-sm text-green-400 hover:text-green-300">Issuer dashboard →</Link>
          </div>
        </div>
      </section>

      {/* One-line integration */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-3">One line. Full compliance.</h2>
          <p className="text-gray-400">Gate any function behind a ZK credential check.</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 overflow-x-auto">
          <pre className="text-sm font-mono text-gray-300">{`contract MyRWAToken {
    IHSKPassport passport;

    function mint(ISemaphore.SemaphoreProof calldata proof) external {
        require(proof.message == uint256(uint160(msg.sender)), "bind proof to caller");
        require(passport.verifyCredential(15, proof), "KYC required"); // ← One line. Done.
        _mint(msg.sender, 100e18);
    }
}`}</pre>
        </div>
        <div className="text-center mt-6">
          <Link href="/developers" className="text-sm text-purple-400 hover:text-purple-300">
            Read the full integration guide →
          </Link>
        </div>
      </section>

      {/* Architecture */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-10">How it works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              step: "1",
              title: "Issuer verifies off-chain",
              desc: "A trusted issuer (e.g., HashKey Exchange, approved KYC provider) verifies the user's identity documents off-chain. They add the user's cryptographic commitment (hash of a keypair) to an on-chain Semaphore group.",
            },
            {
              step: "2",
              title: "User proves in-browser",
              desc: "The user generates a Groth16 zero-knowledge proof in their browser via WASM. This proof demonstrates group membership — without revealing WHICH member. Proof is bound to the caller address to prevent front-running.",
            },
            {
              step: "3",
              title: "dApp verifies on-chain",
              desc: "Any dApp on HashKey Chain calls verifyCredential() with the proof. The contract returns true/false in ~241k gas. The dApp learns nothing about who the user is — only that they hold a valid credential.",
            },
          ].map((s) => (
            <div key={s.step} className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <div className="text-4xl font-bold text-purple-400 mb-3">{s.step}</div>
              <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-gray-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ecosystem preview */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Ecosystem</h2>
            <p className="text-gray-400 text-sm">Live dApps using HSK Passport on testnet today</p>
          </div>
          <Link href="/ecosystem" className="text-sm text-purple-400 hover:text-purple-300">View all →</Link>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { name: "HashKey Silver", symbol: "hSILVER", tag: "RWA", color: "from-gray-700 to-gray-600" },
            { name: "HK Pilot Airdrop", symbol: "hPILOT", tag: "Airdrop", color: "from-purple-900 to-purple-700" },
            { name: "Accredited Pool", symbol: "—", tag: "Lending", color: "from-green-900 to-emerald-700" },
          ].map((app) => (
            <Link href="/ecosystem" key={app.name} className="block bg-gray-900 border border-gray-800 hover:border-purple-800 rounded-xl overflow-hidden transition-colors">
              <div className={`h-1 bg-gradient-to-r ${app.color}`} />
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-semibold">{app.name}</div>
                  <span className="text-xs text-gray-500">{app.tag}</span>
                </div>
                <div className="text-xs font-mono text-purple-400">{app.symbol}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Roadmap */}
      <section className="max-w-4xl mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-10">Roadmap</h2>
        <div className="space-y-3">
          {[
            { period: "Q2 2026", items: ["Mainnet deployment on HashKey Chain", "Integration with HashKey Exchange KYC provider", "SDK v1.0 on npm", "Third-party issuer onboarding program"], status: "current" },
            { period: "Q3 2026", items: ["HashKey DID bridge — compose with existing .key identities", "Jurisdiction-aware credential types (EU, SG, AE, US)", "Revocation registry v2 with on-chain status lists", "Mobile SDK (React Native)"], status: "planned" },
            { period: "Q4 2026", items: ["Cross-chain credential bridge (LayerZero / HashKey Bridge)", "Zupass / PCD interop for event-based credentials", "Regulatory audit report", "HSK token staking for issuers"], status: "planned" },
          ].map((q) => (
            <div key={q.period} className={`bg-gray-900 border rounded-xl p-5 ${q.status === "current" ? "border-purple-700" : "border-gray-800"}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`text-sm font-semibold ${q.status === "current" ? "text-purple-400" : "text-gray-400"}`}>{q.period}</div>
                {q.status === "current" && (
                  <span className="text-xs px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded">Now</span>
                )}
              </div>
              <ul className="text-sm text-gray-300 space-y-1">
                {q.items.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-4xl mx-auto px-4 py-20">
        <div className="bg-gradient-to-br from-purple-950/40 to-gray-900 border border-purple-800/50 rounded-2xl p-10 text-center">
          <h2 className="text-3xl font-bold mb-3">Build the compliant future of HashKey Chain</h2>
          <p className="text-gray-400 max-w-2xl mx-auto mb-8">
            HSK Passport is open source, MIT-licensed, and deployed on HashKey Chain testnet. Integrate in minutes. Scale to production.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/developers" className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors">
              Developer Docs
            </Link>
            <a href="https://github.com/Ridwannurudeen/hsk-passport" target="_blank" rel="noopener noreferrer"
              className="px-6 py-3 bg-gray-900 border border-gray-700 hover:border-gray-500 text-gray-100 font-medium rounded-lg transition-colors">
              View on GitHub
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
