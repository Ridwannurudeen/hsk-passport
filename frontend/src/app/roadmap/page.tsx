export default function RoadmapPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="inline-block px-3 py-1 mb-3 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
        Production Roadmap
      </div>
      <h1 className="text-4xl font-bold mb-3">The Honest Gap Between Hackathon and Production</h1>
      <p className="text-gray-400 text-lg max-w-2xl mb-10">
        What&apos;s shipped today, and what a regulated financial protocol on HashKey Chain needs before mainnet. We&apos;re transparent about both.
      </p>

      <Section title="Shipped — hackathon-grade, working on testnet" tone="green">
        <Item label="Semaphore v4 ZK credentials" detail="Groth16 proofs, bn128 precompiles verified on HashKey Chain, 74 passing tests." />
        <Item label="Per-prover credential freshness (v6)" detail="Custom Circom circuit + FreshnessVerifier + HSKPassportFreshness deployed on testnet. Browser-side Groth16 proof ~4.5s, on-chain verification green (see /demo/fresh)." />
        <Item label="Sumsub KYC integration" detail="Real applicant creation, webhook verification, auto-issuance on GREEN. Sandbox mode for demo." />
        <Item label="Audit-class security hardening" detail="H1 issuer offboarding, H2 anti-sybil bridges, H3/H4 backend privacy, M1-M5 governance + delegate split." />
        <Item label="Composable compliance policies" detail="/composer generates Solidity contract + React gate + tests for any rule set." />
        <Item label="Privacy-safe backend" detail="KYC queue redacts PII unless the caller signs as an approved issuer." />
        <Item label="OpenZeppelin Timelock (48h delay)" detail="Deployed and wired to protocol ownership transfer." />
        <Item label="Issuer slashing via Timelock" detail="IssuerRegistry stake forfeit routed through Timelock authority; 3 Hardhat tests cover the flow (authority check, cap at available stake, IssuerSlashed emission)." />
        <Item label="SDK on npm" detail="hsk-passport-sdk v1.1.0 published with v6 freshness module; contracts library in-repo." />
      </Section>

      <Section title="Q3 2026 — production hardening" tone="yellow">
        <Item label="Issuer-side v6 auto-registration" detail="Backend auto-issuer posts Poseidon(commitment, issuanceTime) to FreshnessRegistry at issuance time. Scoped but not yet wired — today only the seeded demo credential exists on-chain." />
        <Item label="Blind-signature issuance" detail="Backend never learns commitment ↔ Sumsub applicant mapping. Eliminates the backend-correlation risk." />
        <Item label="Multi-sig governance handoff" detail="3-of-5 Safe with core contributors as signers, timelock as executor." />
        <Item label="HSM-protected issuer keys" detail="YubiHSM or AWS CloudHSM for issuer private keys — no more .env secrets on VPS." />
        <Item label="Sumsub production tier" detail="Switch from sandbox to prd token. iBeta L2 liveness, document authenticity, internal dedup." />
        <Item label="Anonymity set floor enforcement" detail="Reject proofs from groups below 1000 members; verifier warns on groups below 10000." />
      </Section>

      <Section title="Q4 2026 — scale and trust minimization" tone="purple">
        <Item label="Formal security audit" detail="Trail of Bits or OpenZeppelin full audit (6-8 weeks, ~$100-200k)." />
        <Item label="Proof aggregation" detail="Nova/HyperNova folding or recursive Groth16 for batch verification at ≤50k gas per proof." />
        <Item label="Cross-chain availability" detail="LayerZero message routing — verifiers callable from Arbitrum, Base, Ethereum mainnet." />
        <Item label="Decentralized issuer network" detail="Permissionless Tier-3 issuers with reputation scoring and public audit logs." />
        <Item label="Efficient revocation via accumulators" detail="Move from client-side Merkle tree reconstruction to RSA accumulator or MMR for O(log n) revocation checks." />
      </Section>

      <Section title="Threat model — where HSK Passport protects, and where it does not" tone="red">
        <Item label="Protects" detail="Identity leakage to dApps, sybil attacks at verifier (same commitment, per-action scope), front-running of proofs (caller-bound message), issuer abuse (revocation + group freeze)." />
        <Item label="Does not protect" detail="Coerced real users, deepfake attacks against the KYC provider, compromised issuer private key (until HSM ships), correlation by someone with backend DB access (until blind issuance ships)." />
      </Section>

      <div className="mt-12 bg-gray-900 border border-gray-800 rounded-xl p-5 text-sm text-gray-400">
        <strong className="text-white block mb-2">On honest positioning:</strong>
        Every KYC-gated protocol has these gaps. Most don&apos;t list them. We list them because closing them is the work, not pretending they don&apos;t exist.
      </div>
    </div>
  );
}

function Section({ title, tone, children }: { title: string; tone: "green" | "yellow" | "purple" | "red"; children: React.ReactNode }) {
  const toneMap = {
    green: "border-green-800/50 bg-green-950/20",
    yellow: "border-yellow-800/50 bg-yellow-950/20",
    purple: "border-purple-800/50 bg-purple-950/20",
    red: "border-red-800/40 bg-red-950/20",
  };
  const titleTone = {
    green: "text-green-300",
    yellow: "text-yellow-300",
    purple: "text-purple-300",
    red: "text-red-300",
  };
  return (
    <section className={`mb-8 border rounded-xl p-5 ${toneMap[tone]}`}>
      <h2 className={`text-xl font-semibold mb-4 ${titleTone[tone]}`}>{title}</h2>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}

function Item({ label, detail }: { label: string; detail: string }) {
  return (
    <li className="text-sm">
      <div className="font-medium text-gray-100">{label}</div>
      <div className="text-xs text-gray-400 mt-0.5">{detail}</div>
    </li>
  );
}
