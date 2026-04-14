<div align="center">

# HSK Passport

**The default compliance layer for regulated apps on HashKey Chain.**

Verify once with a trusted issuer. Privately prove KYC, accreditation, or jurisdiction to any HashKey Chain dApp. Reveal nothing on-chain.

[![Live demo](https://img.shields.io/badge/live-hskpassport.gudman.xyz-4f7cff?style=flat-square)](https://hskpassport.gudman.xyz)
[![Policy Composer](https://img.shields.io/badge/Policy_Composer-try_it-4f7cff?style=flat-square)](https://hskpassport.gudman.xyz/composer)
[![npm](https://img.shields.io/npm/v/hsk-passport-sdk?style=flat-square&color=4f7cff&label=sdk)](https://www.npmjs.com/package/hsk-passport-sdk)
[![Tests](https://img.shields.io/badge/tests-45_passing-22c25e?style=flat-square)](#tests)
[![Audits](https://img.shields.io/badge/audits-3_rounds-22c25e?style=flat-square)](audits/)
[![License](https://img.shields.io/badge/license-MIT-4f7cff?style=flat-square)](LICENSE)

<p><em>We're not replacing HashKey's compliance stack — we're making it reusable and private across the ecosystem.</em></p>

<a href="https://hskpassport.gudman.xyz">
  <img src="docs/screenshots/home.png" alt="HSK Passport homepage" width="100%" />
</a>

</div>

---

## Table of contents

- [What is this?](#what-is-this)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [The Policy Composer](#the-policy-composer)
- [How it compares](#how-it-compares)
- [Deployed contracts](#deployed-contracts)
- [Install & run locally](#install--run-locally)
- [Security](#security)
- [Audits](#audits)
- [Tests](#tests)
- [Related work](#related-work)
- [Repo layout](#repo-layout)
- [License](#license)

---

## What is this?

Every regulated dApp on HashKey Chain — silver-backed RWAs, tokenized funds, accredited DeFi — needs KYC. Today every team rebuilds it from scratch and leaks identity on-chain.

HSK Passport is a reusable on-chain layer that turns HashKey's existing compliance infrastructure (Sumsub, the `.key` DID, Exchange KYC SBTs) into zero-knowledge credentials that any dApp can verify with a single `require` line.

**In one sentence**: A user verifies once via Sumsub, gets a Semaphore ZK credential bound to their wallet, and proves eligibility to any compliant dApp — without revealing identity on-chain.

Built for the [HashKey Chain Horizon Hackathon 2026](https://dorahacks.io/hackathon/2045) — **ZKID Track**.

---

## Quick start

Integrate HSK Passport into any HashKey Chain dApp in three steps.

**1. Install the SDK**

```bash
npm install hsk-passport-sdk ethers
```

**2. Gate any Solidity function with one `require`**

```solidity
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IHSKPassport {
    function verifyCredential(uint256 groupId, ISemaphore.SemaphoreProof calldata proof)
        external view returns (bool);
}

contract MyRWA {
    IHSKPassport constant passport =
        IHSKPassport(0x7d2E692A08f2fb0724238396e0436106b4FbD792);

    function mint(ISemaphore.SemaphoreProof calldata proof) external {
        require(proof.message == uint256(uint160(msg.sender)), "bind to caller");
        require(passport.verifyCredential(25, proof), "KYC required");
        _mint(msg.sender, 100e18);
    }
}
```

**3. Generate a proof in your frontend**

```ts
import { HSKPassport } from "hsk-passport-sdk";

const passport = HSKPassport.connect("hashkey-testnet", signer);
const identity = passport.createIdentity(walletSignature);
const caller = await signer.getAddress();
const proof = await passport.generateProof(identity, 25, "mint-rwa", BigInt(caller));

await myRwa.mint(proof);
```

Prefer checkboxes? Generate the same integration — Solidity, React, Hardhat test — in 30 seconds at [**the Policy Composer**](https://hskpassport.gudman.xyz/composer).

---

## Architecture

<p align="center">
  <img src="docs/architecture.svg" alt="HSK Passport architecture" width="100%"/>
</p>

1. **User** verifies with Sumsub — documents never touch HSK Passport servers.
2. **Issuer** receives Sumsub's GREEN webhook and adds the user's identity commitment to an on-chain credential group.
3. **User** generates a Groth16 ZK proof in-browser (WASM) that proves group membership without revealing which member.
4. **dApp** calls `passport.verifyCredential(groupId, proof)` and gets a yes/no boolean in ~241k gas — learning nothing about the user.

Caller-bound proofs prevent front-running. Per-action nullifiers prevent sybil attacks within a scope. Credentials are revocable, expirable (on-chain), and governance-controlled (48h timelock).

---

## The Policy Composer

<a href="https://hskpassport.gudman.xyz/composer">
  <img src="docs/screenshots/composer.png" alt="Policy Composer" width="100%"/>
</a>

The Composer turns HSK Passport from a protocol into an **adoption tool**. Any dApp builder ticks compliance rules:

- KYC verified
- Accredited investor
- Jurisdiction in `{HK, SG, AE}`

And gets back a ready-to-deploy Solidity contract, a React gate component, and a Hardhat test. Four one-click presets cover the common patterns: *Private RWA Allowlist · Accredited DeFi Pool · APAC Regional RWA · Institutional Tier*.

Try it live: https://hskpassport.gudman.xyz/composer

---

## How it compares

| | HSK Passport | Most competitors |
|---|:---:|:---:|
| Real Sumsub integration wired end-to-end | ✅ | ❌ (mocked / simulated) |
| Policy Composer generating Solidity + React + tests | ✅ | ❌ |
| HashKey DID bridge + HashKey Exchange KYC importer | ✅ | ❌ |
| On-chain credential expiry (`verifyCredentialWithExpiry`) | ✅ | ❌ |
| Issuer slashing via 48h Timelock | ✅ | ❌ |
| Raw-body HMAC webhook verification | ✅ | ❌ |
| Redacted KYC queue + signed-read auth with nonce replay protection | ✅ | ❌ |
| Dark/light theme + design-token system | ✅ | ❌ |
| Three audit rounds documented publicly in [`audits/`](audits/) | ✅ | ❌ |
| Honest threat model at `/roadmap` | ✅ | ❌ |

---

## Deployed contracts

HashKey Chain testnet (chain id 133), v5:

| Contract | Address |
|---|---|
| HSKPassport | [`0x7d2E…D792`](https://hashkey-testnet.blockscout.com/address/0x7d2E692A08f2fb0724238396e0436106b4FbD792) |
| Semaphore v4 | [`0xd09e…CFE9`](https://hashkey-testnet.blockscout.com/address/0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9) |
| CredentialRegistry | [`0x2026…9De1`](https://hashkey-testnet.blockscout.com/address/0x20265dAe4711B3CeF88D7078bf1290f815279De1) |
| IssuerRegistry | [`0x5BbA…b504`](https://hashkey-testnet.blockscout.com/address/0x5BbAe6e90b82c7c51EbA9cA6D844D698dE2eb504) |
| Timelock (48h) | [`0xb07B…3D8A`](https://hashkey-testnet.blockscout.com/address/0xb07Bc78559CbDe44c047b1dC3028d13c4f863D8A) |
| HashKeyDIDBridge | [`0xF072…Ea7a`](https://hashkey-testnet.blockscout.com/address/0xF072D06adcA2B6d5941bde6cc87f41feC5F5Ea7a) |
| HashKeyKYCImporter | [`0x5431…f5B8`](https://hashkey-testnet.blockscout.com/address/0x5431ae6D2f5c3Ad3373B7B4DD4066000D681f5B8) |
| GatedRWA (hSILVER) | [`0xb695…b9c9`](https://hashkey-testnet.blockscout.com/address/0xb6955cb3e442c4222fFc3b92c322851109d0b9c9) |
| KYCGatedAirdrop (hPILOT) | [`0x71c9…b4b8`](https://hashkey-testnet.blockscout.com/address/0x71c96016CBCAeE7B2Edc8b40Fec45de1d16Fb4b8) |
| KYCGatedLending | [`0x3717…0BFD`](https://hashkey-testnet.blockscout.com/address/0x37179886986bd35a4d580f157f55f249c43A0BFD) |
| JurisdictionGatedPool | [`0x305f…Ce4D`](https://hashkey-testnet.blockscout.com/address/0x305f5F0b44d541785305DaDb372f118A9284Ce4D) |

**Credential groups** *(default validity)*: `KYC_VERIFIED 25 (180 d)` · `ACCREDITED_INVESTOR 26 (365 d)` · `HK_RESIDENT 27` · `SG_RESIDENT 28` · `AE_RESIDENT 29` *(residency never expires)*.

---

## Install & run locally

Requires Node 20+.

**Contracts** (Hardhat, 45 passing tests):

```bash
cd contracts
npm install
npx hardhat test
# Deploy to testnet (requires PRIVATE_KEY env + funded HSK)
npx hardhat run scripts/deploy.ts --network hashkey-testnet
```

**Backend** (Fastify + SQLite indexer):

```bash
cd backend
npm install
# env: RPC_URL, ISSUER_PRIVATE_KEY, SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY,
#      SUMSUB_WEBHOOK_SECRET, ALLOWED_ORIGINS
npx tsx src/server.ts
# API lives on :4021
```

**Frontend** (Next.js 16):

```bash
cd frontend
npm install
npm run dev
# App lives on :3000
```

**SDK** (published, but can be built locally):

```bash
cd sdk
npm install
npm run build
```

---

## Security

- **Caller-bound proofs** — `proof.message == uint256(uint160(msg.sender))` on every gated call prevents front-running.
- **Per-group delegate isolation** — delegates for one group cannot issue in another.
- **Issuer offboarding** — revoking an issuer immediately freezes all their groups and any delegate-issued credentials.
- **Anti-sybil bridges** — DID and KYC importers enforce one-source → one-commitment.
- **Revocation-aware proofs** — client filters `CredentialRevoked` events; revoked credentials fail verification.
- **Single-use nonces** on signed-read endpoints prevent issuer-auth replay within the 5-min window.
- **Raw-body HMAC webhook verification** — Sumsub signatures checked over the original bytes, not a JSON re-stringification.
- **CORS lockdown** — only whitelisted origins.
- **Issuer slashing via 48h Timelock** — misissuance forfeits stake through governance review.

Vulnerability disclosure: [SECURITY.md](SECURITY.md). Threat model: [`/roadmap`](https://hskpassport.gudman.xyz/roadmap).

---

## Audits

Three internal audit rounds, 25 findings total, all HIGH / MEDIUM closed before submission. Detailed evidence in [`audits/`](audits/):

- [Round 1 — Contracts & initial design](audits/round-1.md)
- [Round 2 — Privacy-safe backend, Composer, per-wallet identities](audits/round-2.md)
- [Round 3 — Security hardening from full independent review](audits/round-3.md)

A formal third-party audit (Trail of Bits / OpenZeppelin / Spearbit) is planned for mainnet and noted on the [public roadmap](https://hskpassport.gudman.xyz/roadmap).

---

## Tests

```
$ npm test
  45 passing
```

The suite includes `SecurityInvariants.test.ts`, `CredentialExpiry.test.ts`, and `IssuerSlashing.test.ts` — each targeted at the specific invariants that closed the audit findings above.

---

## Related work

HSK Passport builds on and composes with:

- **[Semaphore v4](https://semaphore.pse.dev/)** — the ZK primitive for anonymous group membership (PSE / Ethereum Foundation).
- **[W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model-2.0/)** — schema shape for the credential registry.
- **[OpenZeppelin TimelockController](https://docs.openzeppelin.com/contracts/5.x/governance#timelock)** — governance delay mechanism.
- **[Sumsub](https://sumsub.com)** — the real KYC provider; same one HashKey Exchange uses.

Identity projects in adjacent spaces: [Polygon ID / Privado ID](https://www.privado.id/), [World ID](https://world.org/), [Civic](https://www.civic.com/), [Holonym / Human.tech](https://human.tech/), [Zupass](https://zupass.org/), [Passport by Human.tech](https://passport.human.tech/). HSK Passport is HashKey-Chain-native and optimized for regulated RWA / institutional DeFi on that chain specifically.

---

## Repo layout

```
contracts/     Solidity + Hardhat tests (45 passing) + deploy scripts
backend/       Fastify + SQLite indexer, Sumsub client, auto-issuer
frontend/      Next.js 16 app: /kyc, /composer, /demo, /user, /issuer, …
sdk/           TypeScript SDK (published as `hsk-passport-sdk` on npm)
audits/        Three audit rounds with findings and closure evidence
docs/          Architecture diagram, screenshots, demo script
schemas/       W3C VC credential schemas (KYC / accredited / HK resident)
```

## Links

- Live app — https://hskpassport.gudman.xyz
- Policy Composer — https://hskpassport.gudman.xyz/composer
- Roadmap & threat model — https://hskpassport.gudman.xyz/roadmap
- SDK — https://www.npmjs.com/package/hsk-passport-sdk
- Protocol spec — [PROTOCOL.md](PROTOCOL.md)
- Security policy — [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE) — use, fork, integrate. The default compliance layer should be public goods.
