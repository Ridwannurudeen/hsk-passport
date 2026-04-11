import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      {/* Hero */}
      <div className="text-center mb-20">
        <div className="inline-block px-3 py-1 mb-6 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
          ZKID on HashKey Chain
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
          Prove Compliance.
          <br />
          <span className="text-purple-400">Preserve Privacy.</span>
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10">
          HSK Passport enables privacy-preserving KYC verification on HashKey
          Chain. Issuers grant credentials. Users prove them with zero-knowledge
          proofs. dApps verify without seeing any personal data.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/demo"
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
          >
            Try the Demo
          </Link>
          <Link
            href="/docs"
            className="px-6 py-3 border border-gray-700 hover:border-gray-500 text-gray-300 font-medium rounded-lg transition-colors"
          >
            Integrate
          </Link>
        </div>
      </div>

      {/* How it Works */}
      <div className="mb-20">
        <h2 className="text-2xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg font-bold mb-4">
              1
            </div>
            <h3 className="font-semibold text-lg mb-2">Issuer Verifies</h3>
            <p className="text-sm text-gray-400">
              A trusted issuer (e.g., HashKey Exchange) verifies a user&apos;s KYC
              off-chain and adds their cryptographic identity commitment to a
              credential group on-chain.
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg font-bold mb-4">
              2
            </div>
            <h3 className="font-semibold text-lg mb-2">User Proves</h3>
            <p className="text-sm text-gray-400">
              The user generates a zero-knowledge proof in their browser: &quot;I am
              a member of the KYC_VERIFIED group.&quot; No personal data leaves the
              device.
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg font-bold mb-4">
              3
            </div>
            <h3 className="font-semibold text-lg mb-2">dApp Verifies</h3>
            <p className="text-sm text-gray-400">
              Any dApp on HashKey Chain calls{" "}
              <code className="text-purple-300">verifyCredential()</code> — gets
              a boolean result. Zero personal data on-chain. Full compliance.
            </p>
          </div>
        </div>
      </div>

      {/* Architecture */}
      <div className="mb-20">
        <h2 className="text-2xl font-bold text-center mb-12">Architecture</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 font-mono text-sm overflow-x-auto">
          <pre className="text-gray-300">
{`  Issuer (KYC Provider)          HSK Passport Contract          dApp (RWA, DeFi, etc.)
  ┌───────────────────┐         ┌──────────────────────┐        ┌──────────────────┐
  │                   │         │                      │        │                  │
  │  Off-chain KYC    │────────>│  Semaphore Groups     │<───────│  verifyProof()   │
  │  verification     │  issue  │  (Merkle trees of    │ verify │  => true/false   │
  │                   │  cred   │   identity commits)  │        │                  │
  └───────────────────┘         └──────────┬───────────┘        └──────────────────┘
                                           │
                                           │ ZK proof
                                           │
                                ┌──────────┴───────────┐
                                │     User Browser      │
                                │                       │
                                │  Semaphore Identity    │
                                │  + Proof Generation    │
                                │  (WASM, client-side)   │
                                └───────────────────────┘`}
          </pre>
        </div>
      </div>

      {/* Features */}
      <div className="mb-20">
        <h2 className="text-2xl font-bold text-center mb-12">
          Why HSK Passport
        </h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {[
            {
              title: "Privacy by Default",
              desc: "Users prove credential ownership without revealing identity. Powered by Groth16 zero-knowledge proofs via Semaphore v4.",
            },
            {
              title: "Compliance Ready",
              desc: "Multiple credential groups: KYC Verified, Accredited Investor, HK Resident. Each with independent issuance and revocation.",
            },
            {
              title: "One-Line Integration",
              desc: "Any dApp on HashKey Chain can gate access with a single require(passport.verifyCredential(...)) call.",
            },
            {
              title: "Revocable Credentials",
              desc: "Issuers can revoke credentials at any time. Revoked users' proofs immediately fail verification.",
            },
            {
              title: "Client-Side Proofs",
              desc: "Proof generation runs entirely in the browser via WASM. No personal data ever touches a server.",
            },
            {
              title: "Built for HashKey",
              desc: "Designed for HashKey Chain's compliance-first architecture. Enables KYC-gated RWA, DeFi, and institutional use cases.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-gray-900/50 border border-gray-800 rounded-lg p-5"
            >
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center py-12 border-t border-gray-800">
        <h2 className="text-2xl font-bold mb-4">
          Ready to add ZK credentials to your dApp?
        </h2>
        <div className="flex gap-4 justify-center">
          <Link
            href="/docs"
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
          >
            Read the Docs
          </Link>
          <a
            href="https://github.com/Ridwannurudeen/hsk-passport"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 border border-gray-700 hover:border-gray-500 text-gray-300 font-medium rounded-lg transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
