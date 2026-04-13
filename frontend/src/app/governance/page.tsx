import { ADDRESSES, EXPLORER_URL } from "@/lib/contracts";

export default function GovernancePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-10">
        <div className="inline-block px-3 py-1 mb-3 text-xs font-mono text-yellow-400 border border-yellow-800 rounded-full bg-yellow-950/30">
          Roadmap — Phase 1 of 2 live
        </div>
        <h1 className="text-4xl font-bold mb-3">Governance</h1>
        <p className="text-lg text-gray-400 max-w-2xl">
          HSK Passport uses an OpenZeppelin TimelockController with a 48-hour delay on parameter changes, deployed and operational on testnet. Multi-sig proposer migration (3-of-5 Safe) is scheduled but not yet live — protocol ownership currently rests with the deployer wallet, tracked publicly on-chain.
        </p>
        <div className="mt-4 p-4 bg-yellow-950/20 border border-yellow-900/40 rounded-lg text-sm text-yellow-200">
          <strong className="text-yellow-300">Current status:</strong> Timelock deployed and operational. Multi-sig handoff and full parameter-change enforcement are part of the mainnet roadmap.
        </div>
      </div>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Architecture</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap">
{`┌──────────────┐         ┌─────────────────┐         ┌──────────────┐
│ 3-of-5 Safe  │ propose │   Timelock      │ execute │   Protocol   │
│ (proposers)  │────────>│   48h delay     │────────>│   contracts  │
└──────────────┘         └─────────────────┘         └──────────────┘
                                  │
                                  │ (anyone can execute after delay)
                                  v
                         Public transparency:
                         - scheduled() events
                         - 48h review window
                         - revocation via Safe during window`}
          </pre>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Deployed Governance Contracts</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-gray-800">
            <div>
              <div className="font-medium">HSKPassportTimelock</div>
              <div className="text-xs text-gray-500">OpenZeppelin TimelockController with 48h MIN_DELAY</div>
            </div>
            <a
              href={`${EXPLORER_URL}/address/${ADDRESSES.timelock}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-purple-300 hover:text-purple-200"
            >
              {ADDRESSES.timelock.slice(0, 10)}...{ADDRESSES.timelock.slice(-6)}
            </a>
          </div>
          <div className="flex items-center justify-between pb-3 border-b border-gray-800">
            <div>
              <div className="font-medium">IssuerRegistry</div>
              <div className="text-xs text-gray-500">Staking + slashing (governance-gated)</div>
            </div>
            <a
              href={`${EXPLORER_URL}/address/${ADDRESSES.issuerRegistry}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-purple-300 hover:text-purple-200"
            >
              {ADDRESSES.issuerRegistry.slice(0, 10)}...{ADDRESSES.issuerRegistry.slice(-6)}
            </a>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Safe</div>
              <div className="text-xs text-gray-500">3-of-5 multi-sig (to be deployed on mainnet)</div>
            </div>
            <span className="text-xs text-gray-500">Q2 2026</span>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Issuer Staking Tiers</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-lg font-semibold mb-2">Community</div>
            <div className="text-xs text-purple-300 font-mono mb-3">Tier 1</div>
            <div className="text-2xl font-bold mb-2">0 HSK</div>
            <p className="text-sm text-gray-400">No stake required. Limited to community credential groups (not regulated KYC).</p>
          </div>
          <div className="bg-gray-900 border border-purple-800/50 rounded-xl p-5">
            <div className="text-lg font-semibold mb-2">KYC Provider</div>
            <div className="text-xs text-purple-300 font-mono mb-3">Tier 2</div>
            <div className="text-2xl font-bold mb-2">1,000 HSK</div>
            <p className="text-sm text-gray-400">Can issue KYC credentials. Subject to reputation tracking and slashing for misissuance.</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-lg font-semibold mb-2">Institutional</div>
            <div className="text-xs text-purple-300 font-mono mb-3">Tier 3</div>
            <div className="text-2xl font-bold mb-2">10,000 HSK</div>
            <p className="text-sm text-gray-400">Full protocol permissions: accredited investor, institutional credentials, custom groups.</p>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">What&apos;s Governable</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { title: "Issuer approvals", desc: "Adding new Tier 1/2/3 issuers to the registry" },
            { title: "Credential schemas", desc: "Registering new credential types with JSON-LD schemas" },
            { title: "Validity periods", desc: "How long credentials remain valid before re-verification" },
            { title: "Reputation points", desc: "How many points each credential type is worth" },
            { title: "Stake thresholds", desc: "HSK required for each issuer tier" },
            { title: "Slashing", desc: "Slashing issuers who misbehave (via governance vote)" },
            { title: "Timelock delay", desc: "Minimum delay for parameter changes" },
            { title: "Protocol ownership", desc: "Transfer ownership (e.g., to DAO in Q4 2026)" },
          ].map((item) => (
            <div key={item.title} className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
              <div className="font-medium text-sm mb-1">{item.title}</div>
              <div className="text-xs text-gray-500">{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Migration to DAO</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3 text-sm text-gray-400">
          <p><strong className="text-white">Q2 2026:</strong> 3-of-5 Safe with core contributors as signers</p>
          <p><strong className="text-white">Q3 2026:</strong> Expand to 5-of-9 with ecosystem representatives</p>
          <p><strong className="text-white">Q4 2026:</strong> Migrate to on-chain Governor with token-weighted voting</p>
          <p><strong className="text-white">2027:</strong> Full DAO with treasury, grants, upgradeable by governance</p>
        </div>
      </section>
    </div>
  );
}
