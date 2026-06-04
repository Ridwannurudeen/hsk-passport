# HSK Passport Roadmap

## Status (June 2026)

**Testnet live + soft-mainnet deployed, hackathon-validated.** All protocol contracts deployed on HashKey Chain testnet (chain ID 133); HSKPassport v2 (safe-mode + pauser) and IssuerRegistry now also deployed on mainnet (chain ID 177) but kept inert pending third-party audit. 89 passing contract tests on master (74 base + 15 anonymity-set gate). Public issuer directory and onboarding program live at `/issuers` and `/issuer-program`. SDK published to npm. Live at https://hskpassport.gudman.xyz.

🏆 **3rd place — HashKey Chain Horizon 2026 ZKID Track** (Apr 24 2026).

**Legend:** ✅ done · 🟡 partial / in progress · ☐ not started

> **Roadmap philosophy.** Near-term quarters (Adoption, Q2, Q3) are committed,
> sequenced work. The **Research / Exploratory Backlog** at the bottom is
> deliberately *unscheduled* — high-value directions we'll pull forward as
> adoption, funding, and team size justify them. We'd rather ship a small
> roadmap fully than a large one partially.

---

## Adoption & Sustainability — the success metric

A reusable compliance layer is only as valuable as the dApps that integrate it.
This track is the top priority: everything else exists to serve it.

- [ ] **First 3 design-partner dApps** integrated against the SDK (one `require`
  line eligibility check live in production on each) — target end of Q3 2026
- [ ] **Usage north-star metrics** published on the status page: credentials
  issued, verifications / month, active groups, integrating dApps. Baseline
  today: **13 active credentials, 0 integrating dApps** — the number to move.
- [ ] **Audit funding secured** — the third-party audit costs ~$100–200K and
  gates real mainnet launch. Path: HashKey Chain ecosystem grant +
  Ethereum Foundation PSE / privacy grant applications. **Owner action:
  no mainnet go-live until this is funded.**
- [ ] **Regulator conversation opened** with HK SFC (or via HashKey's existing
  licence) — validate the ZK-compliance posture *before* full launch, not
  after. Existential for a KYC product; pulled forward from Q4.
- [ ] **Sustainability model** decided — issuer staking fees, per-verification
  pricing, or grant-funded public good. Document the chosen model.

## Q2 2026 — Production Launch

- [x] 🟡 **Mainnet deployment** on HashKey Chain (chain ID 177) — HSKPassport v2 (safe-mode + asymmetric pauser) + IssuerRegistry + Timelock deployed (see `contracts/deployments/mainnet-*-177.json`). Kept **inert** (no `approveIssuer`, no groups) until audit completes — credentials still issue on testnet.
- [ ] **Third-party security audit** of contracts and circuits — the critical path for full mainnet launch. Sequenced:
  - [ ] Shortlist + outreach to firms (Trail of Bits / OpenZeppelin / Spearbit)
  - [ ] Freeze audit scope (contracts + Circom circuits) and tag the commit
  - [ ] Secure funding (see Adoption track) and sign engagement
  - [ ] Engagement window (~6–8 weeks) + remediation buffer
  - [ ] Re-verify fixes, publish report under `audits/`, then Phase B handoff
- [x] **SDK v1.0 published** to npm — `hsk-passport-sdk@1.1.0` (incl. v6 freshness module)
- [ ] **Integration with HashKey Exchange KYC** — first production issuer
- [x] **Third-party issuer onboarding program** — `Issuer.json` schema + `/issuer-program` registration page + `/issuers` public directory + `GET /api/issuers` enrichment endpoint
- [x] 🟡 **Monitoring & uptime SLA** for indexer API — `/api/healthz` + `/api/metrics` + `HealthIndicator` + `RUNBOOK.md` live (`backend/src/health.ts`). Remaining: Grafana dashboard, alerting, public status page.

## Q3 2026 — Production Hardening

- [x] 🟡 **Issuer-side v6 auto-registration** — `backend/src/auto-issuer.ts` posts Poseidon leaves to `FreshnessRegistry`; issuer EOA authorized on testnet groups 25/26/27, loop running. Awaiting first KYC carrying a `freshness_commitment` to exercise end-to-end.
- [ ] **Blind-signature issuance** — backend never learns commitment ↔ Sumsub applicant mapping; eliminates backend-correlation risk
- [x] 🟡 **Multi-sig governance handoff** — `HSKPassportTimelock` (48h delay) deployed on mainnet; IssuerRegistry `slashingAuthority` already transferred to it (`slashingIsTimelock: true`). Remaining: transfer ownership (Phase B, gated on audit) and stand up the 3-of-5 Safe.
- [ ] **HSM-protected issuer keys** — YubiHSM or AWS CloudHSM; no more `.env` secrets on VPS
- [ ] **Incident-response runbook + pause drill** — document issuer-key-compromise response; rehearse the `pause` / `pauseIssuer` path end-to-end on testnet so the asymmetric pauser is proven before it's ever needed in anger
- [ ] **Sumsub production tier** — switch from sandbox to prod token; iBeta L2 liveness, document authenticity, internal dedup
- [x] 🟡 **Anonymity-set floor enforcement** — `AnonymitySetGate.sol` built with deploy script + 15 passing tests (hard floor + soft warning, opt-in per dApp). Deployed-ready but **not yet on-chain**.
- [ ] **HashKey DID bridge** — compose HSK Passport credentials with `.key` DIDs without revealing the DID in ZK proofs
- [ ] **Jurisdiction-aware credential types** — separate groups for EU/GDPR, Singapore MAS, UAE VARA, US SEC accredited investor

## Research / Exploratory Backlog — *unscheduled*

High-value but speculative directions. Each is a multi-quarter effort on its
own; they are **not** committed to a quarter and will be pulled forward only as
adoption, funding, and team capacity justify. Listed here to signal intent
without over-promising a timeline.

**Scale & trust-minimization**
- **Proof aggregation** — Nova/HyperNova folding or recursive Groth16 for batch verification at ≤50K gas per proof
- **Cross-chain credential bridge** — verifiers callable from Arbitrum, Base, Ethereum mainnet via LayerZero or HashKey Bridge
- **Decentralized issuer network** — permissionless Tier-3 issuers with reputation scoring and public audit logs
- **Efficient revocation via accumulators** — RSA accumulator or MMR for O(log n) revocation checks
- **Zupass / PCD interop** — import Semaphore-based event credentials from Zupass

**Advanced privacy**
- **Selective disclosure** — prove attributes (age range, jurisdiction, investor tier) without revealing the full credential
- **Multi-issuer aggregation** — prove "at least N approved issuers verified me"
- **PLONKish circuit migration** — replace Groth16 with halo2 / plonky2 for trustless-setup ZK
- **Decentralized issuer DAO** — DAO governance for issuer approval, schema registry, parameter changes

---

## Open Research Questions

- **Anonymity-set lower bound**: enforce minimum group size at the circuit level?
- **Private revocation**: prove non-revocation without revealing which credential was checked?
- **HashKey Exchange SBT integration**: bridge from SBT-based KYC to ZK-based proofs

---

## How to Contribute

- **Developers**: pick up a task from the roadmap, open a PR
- **Issuers**: visit [/issuer-program](https://hskpassport.gudman.xyz/issuer-program) to stake and register, or contact us for a guided onboarding
- **Researchers**: open an issue describing your ZK privacy research proposal
- **Auditors**: audit engagements planned for Q2 2026 mainnet launch
