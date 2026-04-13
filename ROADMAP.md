# HSK Passport Roadmap

## Status (April 2026)

**Testnet live.** All protocol contracts deployed on HashKey Chain testnet, indexer API serving ~13 active credentials across 3 groups, 3 reference dApps integrated (RWA mint, sybil-resistant airdrop, accredited lending).

---

## Q2 2026 — Production Launch

- [ ] **Mainnet deployment** on HashKey Chain (chain ID 177)
- [ ] **Third-party security audit** of contracts and circuits
- [ ] **SDK v1.0** published to npm (`hsk-passport-sdk`)
- [ ] **Integration with HashKey Exchange KYC** — the first production issuer
- [ ] **Third-party issuer onboarding program** — application form, approval process, technical docs for KYC providers to become issuers
- [ ] **Monitoring & uptime SLA** for indexer API

## Q3 2026 — Ecosystem Expansion

- [ ] **HashKey DID bridge** — compose HSK Passport credentials with `.key` DIDs. A user with a HashKey DID can hold a Semaphore identity as an NFT-linked credential without revealing the DID in ZK proofs.
- [ ] **Jurisdiction-aware credential types** — separate groups for EU/GDPR-compliant KYC, Singapore MAS-approved, UAE VARA, US SEC accredited investor
- [ ] **Revocation registry v2** — on-chain status lists per W3C VC standards, enabling off-chain revocation checks
- [ ] **Mobile SDK** (React Native) — ZK proof generation on mobile via WASM bridge
- [ ] **Ecosystem integrations** — partner with 5 HashKey Chain dApps for priority integration support

## Q4 2026 — Cross-Chain + Standards

- [ ] **Cross-chain credential bridge** — attest HashKey Chain credentials on Ethereum, Arbitrum, Base via LayerZero or HashKey Bridge
- [ ] **Zupass / PCD interop** — import Semaphore-based event credentials from Zupass, enabling event-based gating in HashKey dApps
- [ ] **Regulatory audit report** — independent review of privacy guarantees and compliance posture for Hong Kong SFC
- [ ] **HSK token staking for issuers** — economic security layer, slashing for misissuance

## 2027 — Advanced Privacy

- [ ] **Selective disclosure** — prove attributes (age range, jurisdiction, investor tier) without revealing the full credential
- [ ] **Multi-issuer aggregation** — prove "at least N approved issuers verified me"
- [ ] **PLONKish circuit migration** — replace Groth16 with halo2 / plonky2 for trustless-setup ZK
- [ ] **Decentralized issuer network** — DAO governance for issuer approval, schema registry, parameter changes

---

## Open Research Questions

- **Anonymity set lower bound**: enforce minimum group size at circuit level?
- **Private revocation**: can we prove non-revocation without revealing which credential was checked?
- **HashKey Exchange SBT integration**: bridge from SBT-based KYC to ZK-based proofs

---

## How to Contribute

- **Developers**: pick up a task from the roadmap, open a PR
- **Issuers**: contact us if you run a KYC or compliance service and want to become a protocol issuer
- **Researchers**: open an issue describing your ZK privacy research proposal
- **Auditors**: audit engagements planned for Q2 2026 mainnet launch
