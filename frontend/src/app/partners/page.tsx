import Link from "next/link";

export default function PartnersPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="mb-10 text-center">
        <div className="inline-block px-3 py-1 mb-3 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
          For ecosystem partners
        </div>
        <h1 className="text-4xl font-bold mb-3">Integrate HSK Passport</h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          We handle the integration. You get regulatory-grade compliance with zero personal data on-chain.
        </p>
      </div>

      {/* Target Audience */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-6">Who Should Integrate</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              title: "RWA Issuers",
              desc: "Silver, gold, real estate, tokenized fund issuers on HashKey Chain. Legal compliance without wallet-to-identity linkage.",
              icon: "R",
            },
            {
              title: "DeFi Protocols",
              desc: "Lending, perps, structured products requiring accredited investor status. Tiered access without KYC overhead.",
              icon: "D",
            },
            {
              title: "Exchanges & Neobanks",
              desc: "On/off-ramps that need jurisdiction-aware compliance without building a KYC stack internally.",
              icon: "E",
            },
          ].map((p) => (
            <div key={p.title} className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg font-bold mb-3">
                {p.icon}
              </div>
              <h3 className="font-semibold mb-1">{p.title}</h3>
              <p className="text-sm text-gray-400">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What You Get */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-6">Design Partner Program</h2>
        <div className="bg-gradient-to-br from-purple-950/30 to-gray-900 border border-purple-800/50 rounded-2xl p-6">
          <h3 className="font-semibold mb-3">What we provide</h3>
          <ul className="space-y-2 text-sm text-gray-300 mb-6">
            <li className="flex gap-3">
              <span className="text-purple-400">✓</span>
              <span>Concierge integration: we write the Solidity modifier and frontend hooks for you</span>
            </li>
            <li className="flex gap-3">
              <span className="text-purple-400">✓</span>
              <span>Priority feature requests (your integration needs drive the roadmap)</span>
            </li>
            <li className="flex gap-3">
              <span className="text-purple-400">✓</span>
              <span>Featured placement on the <Link href="/ecosystem" className="text-purple-400 hover:text-purple-300 underline">ecosystem page</Link> and in demo video</span>
            </li>
            <li className="flex gap-3">
              <span className="text-purple-400">✓</span>
              <span>Free for testnet + mainnet until first 10 partners</span>
            </li>
            <li className="flex gap-3">
              <span className="text-purple-400">✓</span>
              <span>Co-marketing: joint announcements tagging @HSKChain, HashKey Capital, etc.</span>
            </li>
          </ul>

          <h3 className="font-semibold mb-3">What we ask</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex gap-3">
              <span className="text-gray-500">·</span>
              <span>Commitment to integrate within 30 days</span>
            </li>
            <li className="flex gap-3">
              <span className="text-gray-500">·</span>
              <span>Public mention (tweet, blog post, or testimonial)</span>
            </li>
            <li className="flex gap-3">
              <span className="text-gray-500">·</span>
              <span>Feedback: product surface, DevX, gaps</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Integration Options */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-6">Integration Patterns</h2>
        <div className="space-y-3">
          {[
            {
              pattern: "Gated function (most common)",
              example: "Mint, deposit, transfer restricted to KYC_VERIFIED users",
              effort: "1 Solidity modifier · 5 min",
            },
            {
              pattern: "Tiered access",
              example: "Retail: no KYC. Accredited borrows: require ACCREDITED_INVESTOR proof",
              effort: "2 Solidity functions · 30 min",
            },
            {
              pattern: "Jurisdiction gating",
              example: "Pool accepts users from HK, SG, or AE — doesn't learn which",
              effort: "Use JurisdictionSetVerifier library · 1 hour",
            },
            {
              pattern: "Sybil-resistant airdrop",
              example: "One claim per identity per round via action-scoped nullifiers",
              effort: "Fork KYCGatedAirdrop · 1 hour",
            },
            {
              pattern: "Reputation-weighted",
              example: "Voting power based on credential count, score threshold required",
              effort: "Use CredentialReputation · 2 hours",
            },
            {
              pattern: "Time-bounded access",
              example: "KYC credential expires after 1 year, must re-verify",
              effort: "Use CredentialExpiry · 30 min",
            },
          ].map((p) => (
            <div key={p.pattern} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="font-medium">{p.pattern}</div>
                <div className="text-xs text-gray-500 mt-0.5">{p.example}</div>
              </div>
              <div className="text-xs text-gray-400 shrink-0 font-mono">{p.effort}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
        <h2 className="text-2xl font-bold mb-3">Ready to integrate?</h2>
        <p className="text-gray-400 mb-6 max-w-xl mx-auto">
          Open an issue on GitHub or reach out. We&apos;ll ship your integration within the week.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <a
            href="https://github.com/Ridwannurudeen/hsk-passport/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
          >
            Open Integration Request
          </a>
          <Link
            href="/developers"
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-lg transition-colors"
          >
            Developer Docs
          </Link>
        </div>
      </div>
    </div>
  );
}
