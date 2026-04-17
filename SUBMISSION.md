# HSK Passport

**The compliance layer for regulated apps on HashKey Chain.**

HashKey Chain Horizon Hackathon 2026 — **ZKID Track**

---

## The story

Alice opens hSILVER to buy tokenized silver. She verifies once with Sumsub and 30 seconds later she is minting. The hSILVER contract knows she is KYC-verified and that her credential is still fresh. It does not know her name, her passport number, when she was verified, or that she is the same person who bought hPILOT yesterday. On-chain she is anonymous. To the regulator she is fully verified. That is the shape of compliance the HashKey ecosystem needs, and it is live today.

A user verifies once via Sumsub — the same regulated KYC provider HashKey Exchange uses in production. They receive a Semaphore zero-knowledge credential bound to their wallet. Any HashKey Chain dApp can call `passport.verifyCredential(groupId, proof)` — or, in v6, `HSKPassportFreshness.verifyFresh(...)` to also require the credential was issued within a dApp-chosen freshness window — and receive a yes/no boolean while learning nothing about who the user is, or exactly when they were verified.

This does not replace HashKey's compliance stack. It makes it reusable, private, and copy-pasteable across the ecosystem.

---

## Links

- **Live app** — <https://hskpassport.gudman.xyz>
- **v6 ZK freshness demo** — <https://hskpassport.gudman.xyz/demo/fresh>
- **Policy Composer** — <https://hskpassport.gudman.xyz/composer>
- **Semaphore mint flow** — <https://hskpassport.gudman.xyz/demo>
- **Demo video** — *[to be added]*
- **GitHub** — <https://github.com/Ridwannurudeen/hsk-passport>
- **SDK on npm** — <https://www.npmjs.com/package/hsk-passport-sdk>
- **Roadmap & threat model** — <https://hskpassport.gudman.xyz/roadmap>
- **Audit rounds** — <https://github.com/Ridwannurudeen/hsk-passport/tree/master/audits>

---

## What's unique

### Policy Composer

Generate a full compliance integration in 30 seconds at `/composer`. dApp builders tick rules and receive a deployable Solidity contract, React gate component, and Hardhat test. Four presets cover the common regulated patterns: Private RWA Allowlist (Reg D 506(c) style), Accredited DeFi Pool (accreditation-gated borrowing), APAC Regional RWA (jurisdiction-set proof over HK/SG/AE), and Institutional Tier (full KYC + accreditation + residency stack). **No other ZKID submission has this.** It turns HSK Passport from a protocol into an adoption tool — any HashKey dApp can be regulated in under 10 minutes.

### Per-prover credential freshness (v6)

A custom Circom 2.1.9 circuit — `credential_freshness.circom` (depth-16 Poseidon Merkle + 64-bit range check, 4,665 wires) — proves the prover's specific credential was issued within a dApp-chosen freshness window, without revealing the exact issuance time. Groth16 with Hermez ptau 14. **Browser-side proof ~4.5 seconds, verified on-chain in real time at `/demo/fresh`.** This closes the gap where earlier ZK identity protocols could only enforce expiry at the group level — meaningful for regulated flows where the regulator cares whether the individual prover is within the re-verification window (Reg D: 13 months; MiCA ongoing suitability; FATF: periodic refresh).

### Official HashKey compatibility

HSK Passport is live-compatible with [HashKey Chain's officially-recommended KYC stack](https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/KYC), the `IKycSBT` soulbound-token interface.

- `HashKeyKycSBTAdapter` → `0xba9c4239A35DA84700ff8c11b35c15e00F6ff794`
- `MockKycSBT` (IKycSBT reference) → `0x6185225D7cFF75191F93713b44EA09c31de545cD`

The adapter reads HashKey's `IKycSBT` byte-for-byte and maps the 5-tier scale (NONE / BASIC / ADVANCED / PREMIUM / ULTIMATE) onto HSK Passport credential groups. When `hunyuankyc.com` publishes the production `IKycSBT` address, one `importer.setKYCSbt(adapter)` call flips the entire pipeline onto real verified users — no code change.

### Real Sumsub KYC, not simulated

Applicant creation, webhook (HMAC verified over the raw request body — hardened in audit Round 3 C1, not a JSON re-stringification), auto-issuance on-chain. Same KYC provider HashKey Exchange uses in production.

---

## What is shipped

Live on **<https://hskpassport.gudman.xyz>**

### Protocol — 16 contracts on HashKey testnet (chain id 133)

**v5 core (13):** HSKPassport, Semaphore v4, CredentialRegistry, IssuerRegistry, HSKPassportTimelock (48 h), HashKeyDIDBridge, HashKeyKYCImporter, HashKeyKycSBTAdapter, MockKycSBT, plus reference dApps GatedRWA (hSILVER), KYCGatedAirdrop (hPILOT), KYCGatedLending, JurisdictionGatedPool.

**v6 freshness stack (3):**

- FreshnessRegistry → `0xd251ecAD1a863299BAD2E25B93377B736a753938`
- FreshnessVerifier (Groth16) → `0x59A03fF053464150b066e78d22AEc2F69D081394`
- HSKPassportFreshness → `0xFF790dE1537a84220cD12ef648650034D4725fBb`

On-chain credential expiry via both `verifyCredentialWithExpiry` (v5 group-window) and `HSKPassportFreshness.verifyFresh` (v6 per-prover ZK range proof). Re-verification defaults: KYC 180 days, accreditation 365 days. Issuer slashing through 48 h Timelock — misissuance forfeits stake through governance review.

### Ecosystem bridges

- `HashKeyDIDBridge` — composes with HashKey's `.key` DID identities
- `HashKeyKYCImporter` — imports HashKey Exchange KYC SBTs
- `HashKeyKycSBTAdapter` — bridges HashKey's official `IKycSBT` standard

All anti-sybil enforced via one-source → one-commitment.

### Security discipline — 74 passing tests

55 v5 tests covering security invariants (issuer offboarding, delegate privilege escalation, anti-sybil bridges, credential expiry, slashing authority, IKycSBT adapter + importer end-to-end) + 13 new FreshnessRegistry tests (access control, rolling 100-root history window, group isolation, two-step ownership) + **6 end-to-end ZK tests that generate real Groth16 proofs against the compiled circuit and submit them to the deployed Solidity verifier** — happy path, replay, expiry rejection, unknown root, tampered signals, cross-scope isolation.

3 documented audit rounds in `/audits/` with 26 findings total (including 2 CRITICAL caught in Round 3). All CRITICAL / HIGH / MEDIUM closed before submission. Features: caller-bound proofs, per-action nullifiers, single-use auth nonces, raw-body HMAC, CORS lockdown, redacted public KYC queue, two-step ownership transfer.

### Developer surface

- `hsk-passport-sdk v1.1.0` on npm with a dedicated freshness module (`FreshnessTree`, `createFreshnessIdentity`, `generateFreshnessProof`, `HSKPassportFreshnessClient`)
- One-line Solidity integration. React gate component (`<HSKPassportGate>`)
- Architecture diagram and integration docs in the README
- MIT licensed

---

## Honest scope

v6 circuit, contracts, tests, SDK, and demo are all live on testnet. Issuer-side auto-registration (the backend `auto-issuer` calling `FreshnessRegistry.addLeaf` on every credential issuance) is scoped but **not yet wired** — today only the seeded demo credential at `/demo/fresh` exists on-chain. Any dApp integrating v6 today calls `addLeaf` directly from its own issuance path. Q3 2026 roadmap closes this gap inside the backend.

Sumsub runs in **sandbox mode** on the public site so judges can walk the flow without submitting real documents. Production tokens + iBeta-L2 liveness are on the Q3 roadmap. The Timelock is deployed and operational; multi-sig handoff to a 3-of-5 Safe is Q3. A formal third-party audit (Trail of Bits / OpenZeppelin tier) is Q4 with mainnet.

---

## Tech stack

- **ZK** — Semaphore v4 (Groth16, EdDSA, LeanIMT) + custom Circom 2.1.9 `credential_freshness.circom` + Hermez ptau 14 on bn128 precompiles
- **Contracts** — Solidity 0.8.23+, Hardhat, OpenZeppelin (Ownable, TimelockController)
- **Frontend** — Next.js 16, TypeScript, Tailwind v4, ethers v6, snarkjs browser proving
- **Backend** — Fastify + better-sqlite3, Sumsub HMAC raw-body verification, indexer
- **Network** — HashKey Chain testnet (chain id 133)

---

## Team

Solo-built by the submitter during the hackathon window. Thanks to `@HSKChain`, `@HashKeyHSK`, and `@HashKeyCapital` for the hackathon and platform.
