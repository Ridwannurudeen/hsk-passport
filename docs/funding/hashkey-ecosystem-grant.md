# HashKey Chain Ecosystem Grant — Application (DRAFT)

> **DRAFT — not submitted.** Fill `{{...}}` placeholders and get owner approval
> before sending. See [funding README](./README.md).

- **Project:** HSK Passport — reusable ZK compliance layer for HashKey Chain
- **Applicant:** {{LEGAL_ENTITY}}
- **Contact:** {{CONTACT}}
- **Payout:** {{PAYOUT_ADDRESS}}
- **Amount requested:** {{AMOUNT_REQUESTED}} (see [Budget](#budget))
- **Live:** https://hskpassport.gudman.xyz · **Repo:** https://github.com/Ridwannurudeen/hsk-passport

## One-liner

Verify once with Sumsub, get a Semaphore v4 zero-knowledge credential bound to
your wallet, and any HashKey Chain dApp checks eligibility with one
`verifyCredential` call — the regulator sees full KYC, the chain sees only a
membership proof, no PII on-chain.

## Why this matters to HashKey Chain

HashKey Chain is a licensed, compliance-forward L2. Regulated use cases (RWA,
accredited-investor pools, jurisdiction-gated DeFi) need KYC, but putting
identity on-chain is both a privacy and a regulatory liability. HSK Passport is
the missing primitive: **shared, privacy-preserving compliance that every dApp
on the chain can reuse** instead of each rebuilding KYC. It makes the chain's
regulatory posture a developer feature rather than a per-app burden.

## Traction (verifiable)

- 🏆 3rd place — HashKey Chain Horizon 2026 ZKID Track (Apr 2026).
- Full stack live on testnet (chain 133); `HSKPassport` v2 deployed to mainnet
  (chain 177) in audited-pending **safe mode**.
- SDK published: `hsk-passport-sdk@1.1.0` on npm; runnable integration examples
  in `examples/`.
- 3 internal security-review rounds, 26 findings closed; 104 passing contract
  tests. See [audit history](../../audits/README.md).
- Reference consumer dApps demonstrating the pattern: gated airdrop, gated
  lending, gated RWA token.

## What the grant funds

A **third-party security audit** of the core contracts + the freshness circuit —
the single blocker between safe-mode mainnet and real credential issuance on
mainnet. Scope is fully defined in
[`audits/external-audit-scope.md`](../../audits/external-audit-scope.md):
~1,900 LOC Solidity + one Circom circuit, Tier-1 core + Tier-2 extended.

## Budget

| Item | Estimate |
|---|---|
| Third-party audit (contracts + circuit), 6–8 weeks | $100,000–$200,000 |
| Remediation + re-review buffer | included above |
| **Total request** | **{{AMOUNT_REQUESTED}}** |

If the grant covers part of the audit, we will note co-funding sources (e.g. an
EF PSE grant — see the parallel draft).

## Milestones

1. **M1 — Engagement signed** (commit frozen + tagged, firm selected). _Proof:_ signed SOW, tagged commit.
2. **M2 — Audit delivered.** _Proof:_ report committed under `audits/`.
3. **M3 — Remediation + re-review complete.** _Proof:_ fix PRs + auditor sign-off.
4. **M4 — Mainnet go-live.** _Proof:_ Phase-B ownership handoff to timelock, first production issuer approved, credential groups created on chain 177.

## Team

{{TEAM}}

## Sustainability after the grant

Post-audit, HSK Passport sustains via issuer staking fees in `IssuerRegistry`
(real-money staking is already live on mainnet) and/or per-verification pricing
for high-volume integrators. The audit is the one-time cost that unlocks that.
