# HSK Passport — Outreach Kit (for user approval before sending)

## X/Twitter Thread (primary launch post)

**Tweet 1/6**
Just shipped HSK Passport — the privacy layer for HashKey Chain compliance.

Users prove KYC, accreditation, or residency without revealing identity on-chain.

One credential, verified by any dApp, zero personal data on-chain.

🔗 https://hskpassport.gudman.xyz

**Tweet 2/6**
The problem: every regulated dApp on @HSKChain needs KYC. Today's options are all broken:

❌ Identity on-chain → privacy violation
❌ Each dApp runs its own KYC → fragmented, expensive
❌ Centralized whitelists → single point of failure

**Tweet 3/6**
HSK Passport separates credential verification (on-chain, trustless) from identity verification (off-chain, issuer-gated):

✓ Off-chain issuer verifies once
✓ On-chain commitment (hash, no PII)
✓ Browser-side ZK proof
✓ Any dApp verifies with one function call

**Tweet 4/6**
4 live dApps on testnet demonstrating different patterns:

• hSILVER — KYC-gated RWA token
• hPILOT — sybil-resistant airdrop
• Accredited Lending Pool — tiered borrow
• Multi-Jurisdiction Pool — prove you're in [HK, SG, AE] without revealing which

**Tweet 5/6**
Built for @HSKChain specifically:

→ Bridge from HashKey DID (.key identities)
→ Import HashKey Exchange KYC SBTs
→ 3-tier staked issuer network
→ 48h timelock governance
→ W3C VC-aligned credential schemas

Protocol spec + SDK + REST API all open source.

**Tweet 6/6**
Built for the @HashKeyHSK Horizon Hackathon. Looking for:

• @HSKChain RWA projects wanting compliant user access
• Builders who want to add KYC to their dApp in 10 lines of code
• KYC/compliance providers who want to become issuers

DM open. Let's make HashKey Chain the compliant L2.

---

## HashKey Telegram Dev Group Message

```
Hey builders 👋

I just shipped HSK Passport — a ZK credential protocol for HashKey Chain.

It lets users prove KYC/accreditation/residency to any dApp without revealing identity on-chain. Built for the Horizon Hackathon but architected as production infrastructure.

Live on testnet:
→ https://hskpassport.gudman.xyz

Key features:
• Bridge from HashKey DID + HashKey Exchange KYC
• 4 example dApp integrations (RWA, airdrop, lending, jurisdiction pool)
• Developer SDK + REST API
• Issuer staking network with slashing

Looking for:
• RWA/DeFi projects wanting to add compliance with zero personal data on-chain
• Feedback on the protocol design
• KYC providers interested in becoming approved issuers

Happy to integrate anyone as a design partner — we handle the integration work. Free for testnet, TBD pricing for mainnet.

GitHub: https://github.com/Ridwannurudeen/hsk-passport
```

---

## DoraHacks Hackathon Telegram

```
Just submitted HSK Passport to the ZKID track — would love feedback from fellow builders 🙏

A privacy layer for HashKey Chain compliance. Users prove KYC/accreditation via ZK proof, no personal data on-chain. 

Shipped: 15+ contracts, indexer API, SDK, 4 live dApp integrations, 26 tests passing, developer portal.

Live: https://hskpassport.gudman.xyz
BUIDL: [link TBD]

Specifically interested in:
- Any other ZKID track submissions — would love to cross-review
- HashKey Chain RWA projects looking for compliance layer
- Anyone building in the compliance/identity space on other chains
```

---

## Direct Message (for outreach to specific HashKey ecosystem projects)

Target list from https://hashfans.io/dapps:
- RootData
- Matr1x
- Trusta Labs
- Holdstation
- PolyHedra

```
Hey [team name],

Saw you're building on HashKey Chain — congrats on the [project] launch.

I just shipped HSK Passport (https://hskpassport.gudman.xyz), a ZK credential layer that lets your users prove KYC/residency/accreditation to your dApp without revealing identity on-chain. One credential check, zero personal data.

If [project] has ever thought about adding compliance features — or if you've been avoiding it because of the UX/cost overhead — I'd love to offer free integration support as a design partner. I handle the integration work, you get a credential-gated version of your product.

The stack:
- Integrate with HashKey DID + HashKey Exchange KYC
- Solidity: 1 modifier + 1 line in your function
- Frontend: TypeScript SDK + React component
- Testnet live, mainnet Q2 2026 after audit

Even if integration isn't a fit, would love 10 min of your time to talk compliance priorities on HashKey Chain.

Links:
- Live demo: https://hskpassport.gudman.xyz
- Developer docs: https://hskpassport.gudman.xyz/developers
- GitHub: https://github.com/Ridwannurudeen/hsk-passport

Cheers
```

---

## HashKey Team Outreach (Medium-format, for HashKey Capital / BD)

```
Hi [name],

I've been building on HashKey Chain for the Horizon hackathon and shipped HSK Passport — a ZK credential protocol designed to unblock compliant RWA/DeFi adoption on your chain.

The core thesis: HashKey Chain's positioning as an institutional/regulated L2 requires a credential layer that balances compliance with privacy. Current options force dApps to either expose user identity on-chain or rebuild KYC internally. HSK Passport solves both: one off-chain KYC verification, on-chain ZK-proof verification, zero personal data on-chain.

I've specifically designed the integration to enhance your existing stack:
- Bridges from HashKey DID (.key identities) to HSK Passport credentials
- Imports HashKey Exchange KYC SBT status (Level 1-3) without re-verification
- W3C VC-aligned schemas for regulatory compatibility
- Multi-issuer network with HSK staking (economic security for issuer approvals)

Live testnet demo: https://hskpassport.gudman.xyz
Grant application: https://github.com/Ridwannurudeen/hsk-passport/blob/master/GRANT_APPLICATION.md

I'm applying to the Atlas Grant program for mainnet launch funding. Before that, would love 30 minutes of feedback from you or the compliance team on:
1. Positioning relative to HashKey DID — is "enhance" the right framing?
2. Path to becoming an approved issuer (HashKey Exchange integration)
3. Priority RWA/DeFi projects that could be design partners

No pressure — understand you're busy with the hackathon right now.

Regards,
[your name]
```

---

## Response to common questions

**"How is this different from HashKey DID?"**
HashKey DID is an identity registry (who you are). HSK Passport is a credential verification layer (what you've proven). We integrate with HashKey DID — `.key` holders can bridge their DID ownership into HSK Passport credentials with one transaction. Think of HSK Passport as the privacy-preserving query layer on top of HashKey DID.

**"Why not just use Worldcoin / Privado ID?"**
Those are great generic ZK identity systems, but they're not integrated with HashKey's existing infrastructure. HSK Passport is designed specifically for HashKey Chain — it bridges from HashKey DID and HashKey Exchange KYC, uses HSK for staking, and is governance-aligned with HashKey ecosystem priorities (institutional RWA, regulated DeFi).

**"Isn't the anonymity set small (~13 people)?"**
Yes, currently — we're at testnet with test users. The protocol supports millions of users per group. Privacy improves monotonically with adoption. For launch partners, we recommend waiting until the anonymity set reaches ≥1000 in the relevant group, or using seed credentials from a trusted issuer.

**"What if an issuer misbehaves?"**
Issuers stake HSK bonds (1000 HSK for Tier 2, 10000 for Tier 3). Misissuance evidence submitted to governance can trigger slashing. Reputation is tracked on-chain. In the limit case, an issuer can be removed from the approved list, at which point their credentials can no longer be issued (existing credentials remain valid until expiry).

**"What's the business model?"**
Phase 1: public good funded by HashKey grant. Phase 2: issuer staking yield (issuers earn fees from dApps using their credentials). Phase 3: protocol fee to DAO treasury (optional, governance-controlled).
