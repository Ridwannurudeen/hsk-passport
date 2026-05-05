# HSK Passport Roadmap

## Status (May 2026)

**Testnet live, hackathon-validated.** All protocol contracts deployed on HashKey Chain testnet (chain ID 133), 16 contracts, 74 passing tests across 3 audit rounds. Public issuer directory and onboarding program live at `/issuers` and `/issuer-program`. SDK published to npm.

🏆 **3rd place — HashKey Chain Horizon 2026 ZKID Track** (Apr 24 2026).

---

## Q2 2026 — Production Launch

- [ ] **Mainnet deployment** on HashKey Chain (chain ID 177) — Hardhat networks already configured; awaiting audit decision and `PRIVATE_KEY` for mainnet deployer
- [ ] **Third-party security audit** of contracts and circuits — Trail of Bits or OpenZeppelin (~$100-200K, 6-8 weeks)
- [x] **SDK v1.0 published** to npm — `hsk-passport-sdk@1.1.0` (incl. v6 freshness module)
- [ ] **Integration with HashKey Exchange KYC** — first production issuer
- [x] **Third-party issuer onboarding program** — `Issuer.json` schema + `/issuer-program` registration page + `/issuers` public directory + `GET /api/issuers` enrichment endpoint
- [ ] **Monitoring & uptime SLA** for indexer API — Grafana dashboard, alerting, public status page

## Q3 2026 — Production Hardening

- [ ] **Issuer-side v6 auto-registration** — backend `auto-issuer.ts` posts `Poseidon(commitment, issuanceTime)` to `FreshnessRegistry` at issuance time
- [ ] **Blind-signature issuance** — backend never learns commitment ↔ Sumsub applicant mapping; eliminates backend-correlation risk
- [ ] **Multi-sig governance handoff** — 3-of-5 Safe with core contributors; Timelock as executor
- [ ] **HSM-protected issuer keys** — YubiHSM or AWS CloudHSM; no more `.env` secrets on VPS
- [ ] **Sumsub production tier** — switch from sandbox to prod token; iBeta L2 liveness, document authenticity, internal dedup
- [ ] **Anonymity-set floor enforcement** — reject proofs from groups below 1000 members; verifier warns below 10000
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
