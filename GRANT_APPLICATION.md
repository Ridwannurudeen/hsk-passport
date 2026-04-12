# HSK Passport — HashKey Chain Grant Application

**Applicant**: HSK Passport team
**Requested amount**: TBD (tiered based on milestone achievement)
**Application date**: April 2026
**Grant program**: HashKey Chain Atlas Grant

---

## Executive Summary

HSK Passport is a **privacy-preserving ZK credential protocol for HashKey Chain**. It enables users to prove regulatory status (KYC, accredited investor, jurisdiction) without exposing identity on-chain. Built as a composable layer on top of HashKey's existing identity and KYC infrastructure.

**Live at**: https://hskpassport.gudman.xyz
**Code**: https://github.com/Ridwannurudeen/hsk-passport
**Protocol spec**: https://github.com/Ridwannurudeen/hsk-passport/blob/master/PROTOCOL.md
**Testnet deployment**: 15+ contracts on HashKey Chain testnet (chain ID 133)
**Tests**: 26 passing Hardhat tests covering the critical surface

---

## Problem

HashKey Chain is a compliance-first L2 with a mandate to host regulated RWAs, tokenized funds, and institutional DeFi. This requires every user-facing dApp to enforce KYC, accreditation status, and jurisdiction-scoped access — but current approaches force bad tradeoffs:

| Approach | Problem |
|----------|---------|
| Put identity on-chain | Privacy violation. Wallet ↔ identity permanently linked. |
| Each dApp runs its own KYC | Fragmented UX, 10x cost, vendor lock-in, user re-submits documents for every dApp |
| Centralized whitelists | Single point of failure. Wallet = identity in practice. Operator sees all activity. |

**Result**: The best possible HashKey Chain dApps either skip proper KYC, leak user data, or never launch because compliance is too expensive.

---

## Solution

HSK Passport is the privacy layer that separates **credential verification** (on-chain, trustless) from **identity verification** (off-chain, issuer-gated):

1. **Off-chain issuer verifies identity** (KYC, accreditation, residency). This is existing work done by KYC providers like Sumsub, HashKey Exchange, regulated custodians.
2. **Issuer adds cryptographic commitment on-chain** to a Semaphore group. No personal data stored.
3. **User proves membership via ZK proof** in-browser — they prove they belong to a credential group without revealing which member they are.
4. **dApp verifies the proof on-chain** — gets boolean yes/no, learns zero personal data.

One credential. Verified by any dApp. Revocable. Privacy-preserving. Compliance-compatible.

---

## What's Already Shipped (Testnet)

### Protocol Layer
- **HSKPassport** core contract with per-group delegation, schema linking, caller-bound proofs
- **CredentialRegistry** — W3C VC-aligned schema registry with revocation registry
- **CredentialExpiry** — time-bounded credentials (1y KYC, 6mo accredited, 2y resident)
- **CredentialReputation** — cross-credential scoring with 5 tiers (Bronze → Platinum)
- **JurisdictionSetVerifier** — selective disclosure: prove membership in ANY of [HK, SG, AE, ...]
- **IssuerRegistry** — multi-issuer staking (1k-10k HSK tiers) with reputation tracking
- **HSKPassportTimelock** — 48h OpenZeppelin timelock for governance

### HashKey Ecosystem Integration
- **HashKeyDIDBridge** — bridge HashKey DID ownership to HSK Passport credentials
- **HashKeyKYCImporter** — import HashKey Exchange KYC SBT status (Level 1/2/3)

### Example dApps (all live on testnet)
- **hSILVER** — KYC-gated silver RWA token (nullifier-tracked mint)
- **hPILOT** — sybil-resistant airdrop (action-scoped nullifiers, per-round claims)
- **Accredited Lending Pool** — tiered borrow: retail capped, accredited uncapped
- **Multi-Jurisdiction Pool** — accept users from any of [HK, SG, AE] without revealing which

### Developer Surface
- **TypeScript SDK** (`@hsk-passport/sdk`) with React `<HSKPassportGate />` component
- **REST API indexer** — 10-second polling, revocation-aware member queries
- **KYC workflow API** — user submission → issuer review → on-chain issuance
- **Developer portal** with quick-start, code snippets, live addresses, API reference
- **26 Hardhat tests** passing: proof verification, revocation, delegate isolation, caller binding, nullifier reuse

### Infrastructure
- **Next.js frontend** with 9 pages: landing, KYC, issuer, demo, ecosystem, developers, governance, bridge, user
- **Backend indexer** running on production VPS (systemd, nginx, SSL)
- **Live production domain**: hskpassport.gudman.xyz
- **All contracts verified** on HashKey Chain testnet Blockscout

---

## Technical Novelty (Beyond Existing Work)

Semaphore wrappers are common (Worldcoin, Zupass, Privado ID). HSK Passport adds:

1. **Time-bounded credentials** — regulatory-grade KYC with mandatory re-verification windows. Few ZK identity systems enforce this on-chain.
2. **Cross-credential reputation** — aggregate score across multiple credentials with private threshold proofs. Enables tiered access without revealing which credentials you hold.
3. **Selective jurisdiction disclosure** — prove membership in a set of jurisdictions without revealing which. GDPR-compatible data minimization pattern.
4. **HashKey-native bridges** — first-class integration with HashKey DID and HashKey Exchange KYC SBTs. Not a generic ZK identity system — specifically designed for HashKey's compliance stack.
5. **Staked issuer network** — economic security layer via HSK bonds, slashable for misissuance. Aligns issuer incentives with protocol integrity.

---

## Why HashKey Chain (and not Ethereum / another L2)

- **HashKey is regulated** (SFC license, RWA issuance mandate). Our value proposition only makes sense on a compliance-first chain.
- **HashKey has existing KYC infrastructure** (Exchange SBTs, HashKey DID). We enhance rather than replace.
- **HashKey is small enough** (~13-150k addresses at this stage) that protocol-level infrastructure can still be adopted early. Ethereum mainnet has too many entrenched standards.
- **HashKey's positioning as Asian institutional chain** aligns with jurisdiction-aware credentials (HK, SG, JP, AE markets).

---

## Roadmap & Grant Milestones

### Milestone 1 — Mainnet Launch (Q2 2026, ~$25k)
- Deploy full protocol stack to HashKey Chain mainnet
- 3-of-5 Gnosis Safe + 48h timelock for governance
- SDK v1.0 published to npm
- Docusaurus docs site
- Integration with HashKey Exchange as first production issuer (institutional tier)

### Milestone 2 — Third-Party Issuer Network (Q3 2026, ~$40k)
- Security audit by reputable firm (Trail of Bits, Consensys Diligence, or similar)
- Issuer onboarding program: 3-5 approved issuers active on mainnet
- HashKey DID contract deployed on HashKey Chain + real bridge activation
- Mobile SDK (React Native)
- First 5 dApp integrations (ecosystem partners)

### Milestone 3 — Cross-Chain + Advanced Privacy (Q4 2026, ~$50k)
- Cross-chain credential bridge (LayerZero / HashKey Bridge integration)
- Zupass / PCD interop — import event credentials from broader ZK identity ecosystem
- Private revocation checks (accumulator-based non-revocation proofs)
- Regulatory audit report for SFC reference
- Jurisdiction-specific schemas (EU GDPR, SG MAS, US SEC, AE VARA)

### Milestone 4 — Advanced ZK Primitives (2027, ~$75k)
- Selective attribute disclosure circuits (age ranges, income tiers)
- Multi-issuer aggregation proofs ("N-of-M issuers verified me")
- PLONKish migration (trustless-setup alternative to Groth16)
- DAO migration with HSK staking governance

---

## Ask

**Initial grant: Milestone 1 funding** (~$25k USD equivalent in HSK or USDC) to cover:
- Security audit ($15k): critical before mainnet
- Infrastructure runway ($5k): indexer VPS, monitoring, SSL, RPC redundancy for 12 months
- Developer advocacy ($5k): integration concierge for first 3-5 dApp partners

Subsequent milestones unlocked based on measurable adoption (active integrations, credentials issued, dApp count).

**Equity/token**: no request. HSK Passport is positioned as public infrastructure; sustainability via issuer staking yield + optional protocol fee to DAO treasury in later phases.

---

## Team

**Solo builder** (currently) with open invitation for co-contributors. Details in team bio / LinkedIn / X.

Track record: HashKey Chain testnet deployment, 26 passing tests, full product surface (KYC workflow, issuer dashboard, 4 integrated dApps, REST API, SDK, docs) shipped in under 2 weeks.

---

## Why Now

- HashKey's RWA mandate is accelerating (silver tokens, fund ETFs announced Q1 2026)
- Every regulated RWA project on HashKey Chain will need this infrastructure
- No other team is building ZK compliance infrastructure specifically for HashKey Chain
- First-mover advantage for the compliance standard

A well-designed ZK credential protocol, adopted early, becomes the default compliance layer for the entire ecosystem. HSK Passport is positioned to be that standard.

---

## Links

- **Live demo**: https://hskpassport.gudman.xyz
- **GitHub**: https://github.com/Ridwannurudeen/hsk-passport
- **Protocol spec**: https://github.com/Ridwannurudeen/hsk-passport/blob/master/PROTOCOL.md
- **Roadmap**: https://github.com/Ridwannurudeen/hsk-passport/blob/master/ROADMAP.md
- **Security policy**: https://github.com/Ridwannurudeen/hsk-passport/blob/master/SECURITY.md
- **Hackathon BUIDL**: https://dorahacks.io/buidl/[TBD when submitted]
