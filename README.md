# HSK Passport

**The default compliance layer for regulated apps on HashKey Chain.**

> Verify once with a trusted issuer. Privately prove KYC, accreditation, or jurisdiction to any HashKey Chain dApp. Reveal nothing on-chain.

**We're not replacing HashKey's compliance stack — we're making it reusable and private across the ecosystem.**

- 🌐 **Live demo**: https://hskpassport.gudman.xyz
- 🧱 **Policy Composer** *(generate Solidity + React + tests in 30 seconds)*: https://hskpassport.gudman.xyz/composer
- 📖 **Protocol spec**: [PROTOCOL.md](PROTOCOL.md)
- 🛡 **Security policy**: [SECURITY.md](SECURITY.md)
- 🗺 **Honest roadmap & threat model**: [/roadmap](https://hskpassport.gudman.xyz/roadmap)
- 📦 **SDK on npm**: [`hsk-passport-sdk`](https://www.npmjs.com/package/hsk-passport-sdk)

Built for the [HashKey Chain Horizon Hackathon 2026](https://dorahacks.io/hackathon/2045) — ZKID Track.

---

## The Problem

Every regulated product on HashKey Chain — silver-backed RWAs, tokenized funds, accredited DeFi — needs compliance. Today that means:

- Users submit the **same KYC** to every dApp separately.
- Wallets get **permanently linked** to identity on-chain.
- dApps **rebuild or buy** their own KYC stack.
- Public allowlists **expose who participates** in what.

HashKey already has the compliance infrastructure (the SFC license, Sumsub-verified Exchange users, the `.key` DID system). What it lacks is a **reusable on-chain layer** that lets that verification flow into every regulated dApp **without leaking identity**.

That's HSK Passport.

## The Pitch in 30 Seconds

A user verifies once via Sumsub *(the same KYC provider HashKey Exchange uses)*. They get a Semaphore credential bound to their wallet. Any dApp on HashKey Chain can then check `passport.verifyCredential(groupId, proof)` — getting a yes/no boolean while learning nothing about the user.

The **Policy Composer** lets any dApp builder generate the Solidity + React + tests for a custom compliance rule like `KYC && (HK || SG || AE) && accredited` in 30 seconds.

## Why HSK Passport Wins the ZKID Track

| | HSK Passport | Most competitors |
|---|---|---|
| **Real Sumsub integration** | ✅ End-to-end working: applicant init → webhook (HMAC raw-body verified) → auto-issuance | ❌ Mocked / simulated / "in roadmap" |
| **Policy Composer** | ✅ Live tool generates Solidity + React + Hardhat test from rule checkboxes | ❌ Nothing equivalent |
| **HashKey ecosystem bridges** | ✅ HashKey DID Bridge + HashKey Exchange KYC Importer (anti-sybil enforced) | ❌ Generic identity, no HashKey-specific bridges |
| **Production-discipline backend** | ✅ Redacted public KYC queue, signed-read auth with nonce replay protection, raw-body webhook HMAC | ❌ Public PII, no replay protection |
| **Audit rounds documented** | ✅ Three rounds, 12/12 findings closed, 45 passing tests | ❌ Single-round / no public audit |
| **Honest roadmap & threat model** | ✅ [/roadmap](https://hskpassport.gudman.xyz/roadmap) lists what we don't yet protect against | ❌ Marketing-only positioning |
| **On-chain credential expiry** | ✅ `verifyCredentialWithExpiry` enforces 180-day KYC freshness | ❌ Set-and-forget |
| **Issuer slashing wired to Timelock** | ✅ 48h governance review on stake forfeit | ❌ No issuer accountability |

## The Demo Flow (one minute)

1. Open `/kyc` → connect wallet → Sumsub sandbox runs (real KYC provider — same one HashKey Exchange uses).
2. Webhook fires → backend auto-issues credential on-chain.
3. Open `/composer` → tick `KYC + (HK || SG || AE)` → copy the generated Solidity contract.
4. Open `/demo` → generate ZK proof in-browser → mint hSILVER through the gated dApp.
5. Show `/user` → "Verified Identity" data fetched live from Sumsub *(zero stored on our side)*.

**One sentence:** A user just got KYC'd, minted a regulated token anonymously, and any dApp builder can copy-paste the same compliance gate in 10 minutes.

## The Composer is the Strategic Anchor

The Composer turns HSK Passport from "a protocol" into "an adoption tool." A dApp builder ticks rules:

- ☑ KYC verified
- ☑ Accredited investor
- ☑ Jurisdiction in [HK, SG, AE]

And gets:

- Full Solidity contract with caller-bound proof + KYC check + jurisdiction set proof + accredited check
- React component using `hsk-passport-sdk/react`
- Hardhat test with attacker-rejection + valid-user-acceptance cases

Try it: https://hskpassport.gudman.xyz/composer

This is what makes HSK Passport **inevitable** as the standard compliance layer — not just possible to use, but trivial to adopt.

---

## What's Live on HashKey Chain Testnet (v5)

| Contract | Address | Purpose |
|---|---|---|
| HSKPassport | [`0x7d2E…D792`](https://hashkey-testnet.blockscout.com/address/0x7d2E692A08f2fb0724238396e0436106b4FbD792) | Credential groups, issuance, verification, on-chain expiry |
| Semaphore v4 | [`0xd09e…CFE9`](https://hashkey-testnet.blockscout.com/address/0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9) | ZK proof verification (Groth16, bn128) |
| CredentialRegistry | [`0x2026…9De1`](https://hashkey-testnet.blockscout.com/address/0x20265dAe4711B3CeF88D7078bf1290f815279De1) | Schema registry (W3C VC aligned) |
| IssuerRegistry | [`0x5BbA…b504`](https://hashkey-testnet.blockscout.com/address/0x5BbAe6e90b82c7c51EbA9cA6D844D698dE2eb504) | Multi-issuer staking + reputation, slashing via Timelock |
| Timelock | [`0xb07B…3D8A`](https://hashkey-testnet.blockscout.com/address/0xb07Bc78559CbDe44c047b1dC3028d13c4f863D8A) | OZ TimelockController, 48h delay on parameter changes |
| HashKeyDIDBridge | [`0xF072…Ea7a`](https://hashkey-testnet.blockscout.com/address/0xF072D06adcA2B6d5941bde6cc87f41feC5F5Ea7a) | Bridge `.key` DIDs → credentials (anti-sybil) |
| HashKeyKYCImporter | [`0x5431…f5B8`](https://hashkey-testnet.blockscout.com/address/0x5431ae6D2f5c3Ad3373B7B4DD4066000D681f5B8) | Bridge HashKey Exchange KYC SBTs → credentials |
| GatedRWA (hSILVER) | [`0xb695…b9c9`](https://hashkey-testnet.blockscout.com/address/0xb6955cb3e442c4222fFc3b92c322851109d0b9c9) | KYC-gated regulated RWA mint |
| KYCGatedAirdrop (hPILOT) | [`0x71c9…b4b8`](https://hashkey-testnet.blockscout.com/address/0x71c96016CBCAeE7B2Edc8b40Fec45de1d16Fb4b8) | Sybil-resistant airdrop |
| KYCGatedLending | [`0x3717…0BFD`](https://hashkey-testnet.blockscout.com/address/0x37179886986bd35a4d580f157f55f249c43A0BFD) | Tiered lending (retail + accredited) |
| JurisdictionGatedPool | [`0x305f…Ce4D`](https://hashkey-testnet.blockscout.com/address/0x305f5F0b44d541785305DaDb372f118A9284Ce4D) | Selective jurisdiction disclosure |

**Credential groups** *(on-chain ID → meaning, default validity)*:
KYC_VERIFIED `25` *(180 days)* · ACCREDITED_INVESTOR `26` *(365 days)* · HK_RESIDENT `27` · SG_RESIDENT `28` · AE_RESIDENT `29` *(no expiry)*

## Security — What We Enforce Today

- **Caller-bound proofs** — every gated dApp checks `proof.message == uint256(uint160(msg.sender))` to prevent front-running
- **Per-group delegate isolation** — delegates for one group cannot issue in another
- **Issuer offboarding** — revoking an issuer immediately freezes all their groups and any delegate-issued credentials
- **Anti-sybil bridges** — DID and KYC importers enforce one-source → one-commitment
- **Revocation-aware proofs** — client filters `CredentialRevoked` events; revoked credentials fail verification
- **Authenticated issuer backend** — KYC review and queue read endpoints require wallet signature, with single-use nonce replay protection
- **HMAC raw-body Sumsub webhook verification** — signature checked over the original bytes, not a JSON re-stringification
- **CORS lockdown** — only whitelisted origins
- **Issuer slashing via 48h Timelock** — misissuance forfeits stake through governance review

## Honest Status

- ✅ **Production-shape**: Sumsub flow, ZK proof generation, on-chain verification, issuer review, credential expiry, HashKey ecosystem bridges
- ⚠ **Roadmap (clearly labeled at [/roadmap](https://hskpassport.gudman.xyz/roadmap))**: blind-issuance for backend-correlation resistance, formal audit, anonymity-set floor enforcement, cross-chain availability, biometric-bound identities

We document what we don't yet protect against. Most KYC-gated protocols don't.

## Developer Integration

Gate any function behind ZK KYC in one line:

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
        // 1. Bind proof to caller — prevents front-running.
        require(proof.message == uint256(uint160(msg.sender)), "bind to caller");
        // 2. Check KYC credential.
        require(passport.verifyCredential(25, proof), "KYC required");
        // 3. Your logic.
        _mint(msg.sender, 100e18);
    }
}
```

Frontend SDK:

```ts
import { HSKPassport } from "hsk-passport-sdk";

const passport = HSKPassport.connect("hashkey-testnet", signer);
const identity = passport.createIdentity(walletSignature);
const callerAddress = await signer.getAddress();
const proof = await passport.generateProof(identity, 25, "mint-rwa", BigInt(callerAddress));
```

Or just use the **[Policy Composer](https://hskpassport.gudman.xyz/composer)** to generate the entire integration in 30 seconds.

## Tech Stack

- **ZK**: Semaphore v4 (Groth16, EdDSA, LeanIMT)
- **Contracts**: Solidity 0.8.24, Hardhat, OpenZeppelin (Timelock, Ownable)
- **Frontend**: Next.js 16, TypeScript, Tailwind v4, ethers v6, design-token system with dark/light theme
- **Backend**: Fastify + better-sqlite3 indexer, Sumsub HMAC raw-body webhook verification, signed-read auth
- **KYC**: Sumsub (real provider — same one HashKey Exchange uses)

## Tests

```
$ npm test
  45 passing
```

Coverage includes the full security invariant suite (issuer offboarding, delegate escalation, anti-sybil bridges, credential expiry enforcement, slashing authority).

## Contributing

This repo is the public reference implementation. Issues and PRs welcome — see [SECURITY.md](SECURITY.md) for vulnerability disclosure.

## License

MIT — use, fork, integrate. The default compliance layer should be public goods.
