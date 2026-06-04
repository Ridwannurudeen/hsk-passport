# HSK Passport Roadmap

## Status (June 2026)

**Testnet live + soft-mainnet deployed, hackathon-validated.** All protocol contracts deployed on HashKey Chain testnet (chain ID 133); HSKPassport v2 (safe-mode + pauser) and IssuerRegistry now also deployed on mainnet (chain ID 177) but kept inert pending third-party audit. 89 passing contract tests on master (74 base + 15 anonymity-set gate). Public issuer directory and onboarding program live at `/issuers` and `/issuer-program`. SDK published to npm. Live at https://hskpassport.gudman.xyz.

🏆 **3rd place — HashKey Chain Horizon 2026 ZKID Track** (Apr 24 2026).

**Legend:** ✅ done · 🟡 partial / in progress · ☐ not started

---

## Q2 2026 — Production Launch

- [x] 🟡 **Mainnet deployment** on HashKey Chain (chain ID 177) — HSKPassport v2 (safe-mode + asymmetric pauser) + IssuerRegistry + Timelock deployed (see `contracts/deployments/mainnet-*-177.json`). Kept **inert** (no `approveIssuer`, no groups) until audit completes — credentials still issue on testnet.
- [ ] **Third-party security audit** of contracts and circuits — Trail of Bits or OpenZeppelin (~$100-200K, 6-8 weeks)
- [x] **SDK v1.0 published** to npm — `hsk-passport-sdk@1.1.0` (incl. v6 freshness module)
- [ ] **Integration with HashKey Exchange KYC** — first production issuer
- [x] **Third-party issuer onboarding program** — `Issuer.json` schema + `/issuer-program` registration page + `/issuers` public directory + `GET /api/issuers` enrichment endpoint
- [x] 🟡 **Monitoring & uptime SLA** for indexer API — `/api/healthz` + `/api/metrics` + `HealthIndicator` + `RUNBOOK.md` live (`backend/src/health.ts`). Remaining: Grafana dashboard, alerting, public status page.

## Q3 2026 — Production Hardening

- [x] 🟡 **Issuer-side v6 auto-registration** — `backend/src/auto-issuer.ts` posts Poseidon leaves to `FreshnessRegistry`; issuer EOA authorized on testnet groups 25/26/27, loop running. Awaiting first KYC carrying a `freshness_commitment` to exercise end-to-end.
- [ ] **Blind-signature issuance** — backend never learns commitment ↔ Sumsub applicant mapping; eliminates backend-correlation risk
- [x] 🟡 **Multi-sig governance handoff** — `HSKPassportTimelock` (48h delay) deployed on mainnet; IssuerRegistry `slashingAuthority` already transferred to it (`slashingIsTimelock: true`). Remaining: transfer ownership (Phase B, gated on audit) and stand up the 3-of-5 Safe.
- [ ] **HSM-protected issuer keys** — YubiHSM or AWS CloudHSM; no more `.env` secrets on VPS
- [ ] **Sumsub production tier** — switch from sandbox to prod token; iBeta L2 liveness, document authenticity, internal dedup
- [x] 🟡 **Anonymity-set floor enforcement** — `AnonymitySetGate.sol` built with deploy script + 15 passing tests (hard floor + soft warning, opt-in per dApp). Deployed-ready but **not yet on-chain**.
- [ ] **HashKey DID bridge** — compose HSK Passport credentials with `.key` DIDs without revealing the DID in ZK proofs
- [ ] **Jurisdiction-aware credential types** — separate groups for EU/GDPR, Singapore MAS, UAE VARA, US SEC accredited investor

## Q4 2026 — Scale and Trust Minimization

- [ ] **Proof aggregation** — Nova/HyperNova folding or recursive Groth16 for batch verification at ≤50K gas per proof
- [ ] **Cross-chain credential bridge** — verifiers callable from Arbitrum, Base, Ethereum mainnet via LayerZero or HashKey Bridge
- [ ] **Decentralized issuer network** — permissionless Tier-3 issuers with reputation scoring and public audit logs
- [ ] **Efficient revocation via accumulators** — RSA accumulator or MMR for O(log n) revocation checks
- [ ] **Zupass / PCD interop** — import Semaphore-based event credentials from Zupass
- [ ] **Regulatory audit report** — independent privacy and compliance posture review for HK SFC

## 2027 — Advanced Privacy

- [ ] **Selective disclosure** — prove attributes (age range, jurisdiction, investor tier) without revealing the full credential
- [ ] **Multi-issuer aggregation** — prove "at least N approved issuers verified me"
- [ ] **PLONKish circuit migration** — replace Groth16 with halo2 / plonky2 for trustless-setup ZK
- [ ] **Decentralized issuer DAO** — DAO governance for issuer approval, schema registry, parameter changes

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
