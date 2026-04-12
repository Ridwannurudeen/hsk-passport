# HSK Passport

**The privacy layer for HashKey Chain compliance.**

HSK Passport is a zero-knowledge credential protocol that lets users prove KYC status, accreditation, or residency without revealing their identity. Built for regulated RWA, DeFi, and institutional use cases on HashKey Chain.

- **Live demo**: [https://hskpassport.gudman.xyz](https://hskpassport.gudman.xyz)
- **Protocol spec**: [PROTOCOL.md](PROTOCOL.md)
- **Roadmap**: [ROADMAP.md](ROADMAP.md)
- **Security**: [SECURITY.md](SECURITY.md)

Built for the [HashKey Chain Horizon Hackathon 2026](https://dorahacks.io/hackathon/2045) — ZKID Track.

---

## Why It Matters

HashKey Chain is compliance-first infrastructure. Every RWA token, DeFi protocol, and institutional product needs KYC — but current approaches either expose personal data on-chain (privacy violation), force each dApp to run its own KYC (expensive, fragmented), or rely on centralized whitelists (single point of failure + wallet-to-identity linkage).

HSK Passport solves all three: **one credential, verified by any dApp, with zero personal data on-chain.**

---

## What's Shipped

| Component | Status | What it is |
|-----------|--------|------------|
| **Protocol contracts** | Live on testnet | CredentialRegistry, HSKPassport, HSKPassportVerifier, DemoIssuer |
| **3 reference dApps** | Live on testnet | GatedRWA (silver mint), KYCGatedAirdrop (sybil-resistant), KYCGatedLending (accredited) |
| **TypeScript SDK** | Built, ready to publish | `@hsk-passport/sdk` with React `<HSKPassportGate />` component |
| **Indexer + REST API** | Live | Fastify + SQLite, polls chain events, serves `/api/*` |
| **KYC workflow** | Live | User submission → issuer review → on-chain credential issuance |
| **Developer portal** | Live | Quick-start, API reference, integration examples |
| **26 contract tests** | Passing | Full coverage: issuance, revocation, delegate isolation, caller-bound mint |
| **Documentation** | Complete | Protocol spec, security policy, roadmap, schemas |

---

## Ecosystem (Live on HashKey Chain Testnet)

| dApp | Symbol | Required Credential | Contract |
|------|--------|---------------------|----------|
| HashKey Silver Token | hSILVER | KYC Verified | [`0xFc6bDE32...D249`](https://hashkey-testnet.blockscout.com/address/0xFc6bDE32f79ad43696abc6A2a6291bfA8AF1D249) |
| HashKey Pilot Airdrop | hPILOT | KYC Verified | [`0x02F84538...b01c`](https://hashkey-testnet.blockscout.com/address/0x02F84538E05b66FD207923675f48B70541bBb01c) |
| Accredited Lending Pool | — | Accredited Investor | [`0x5430c4A4...9A20`](https://hashkey-testnet.blockscout.com/address/0x5430c4A4180492D5D0ce059355e82176F8AF9A20) |

## Protocol Contracts (HashKey Chain Testnet)

| Contract | Address |
|----------|---------|
| HSKPassport | [`0x79A0E116...d5E6`](https://hashkey-testnet.blockscout.com/address/0x79A0E1160FA829595f45f0479782095ed497d5E6) |
| CredentialRegistry | [`0x20265dAe...9De1`](https://hashkey-testnet.blockscout.com/address/0x20265dAe4711B3CeF88D7078bf1290f815279De1) |
| Semaphore | [`0xd09e8Aec...CFE9`](https://hashkey-testnet.blockscout.com/address/0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9) |
| DemoIssuer | [`0xD6CB3393...28d1`](https://hashkey-testnet.blockscout.com/address/0xD6CB3393B9e1E162ed3EF8187082511d20Be28d1) |

**Credential Groups**: KYC_VERIFIED (15), ACCREDITED_INVESTOR (16), HK_RESIDENT (17)

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                     User (holder) — Browser                        │
│  Semaphore identity + in-browser Groth16 proof (WASM, snarkjs)     │
└────────────────┬───────────────────────────────────┬───────────────┘
                 │ (submit KYC)                      │ (generate proof)
                 v                                   v
┌──────────────────────────┐        ┌────────────────────────────────┐
│ Indexer + KYC API        │        │ Smart Contracts (HashKey Chain)│
│ (Fastify + SQLite)       │        │                                │
│                          │        │  CredentialRegistry            │
│  /api/groups/:id/members │<──────>│  HSKPassport (group manager)   │
│  /api/kyc/*              │ events │  HSKPassportVerifier (base)    │
│  /api/stats/global       │        │  DemoIssuer / other issuers    │
└──────────────────────────┘        └────────────────────────────────┘
                 ^                                   ^
                 │ (review queue)                    │ (verifyCredential)
                 │                                   │
┌──────────────────────────┐        ┌────────────────────────────────┐
│ Issuer Dashboard         │        │ Ecosystem dApps                │
│ Review + approve/reject  │        │ hSILVER, hPILOT, Lending Pool  │
└──────────────────────────┘        └────────────────────────────────┘
```

---

## Quick Integration for dApp Developers

Gate any function behind a ZK KYC check:

```solidity
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IHSKPassport {
    function verifyCredential(uint256 groupId, ISemaphore.SemaphoreProof calldata proof)
        external view returns (bool);
}

contract MyDApp {
    IHSKPassport passport = IHSKPassport(0x79A0E1160FA829595f45f0479782095ed497d5E6);

    function restrictedAction(ISemaphore.SemaphoreProof calldata proof) external {
        require(proof.message == uint256(uint160(msg.sender)), "bind proof to caller");
        require(passport.verifyCredential(15, proof), "KYC required");
        // your logic here
    }
}
```

Frontend:

```typescript
import { HSKPassport } from "@hsk-passport/sdk";

const passport = HSKPassport.connect("hashkey-testnet", signer);
const identity = passport.createIdentity(walletSignature);
const proof = await passport.generateProof(identity, 15, "my-action", BigInt(callerAddress));
const valid = await passport.verifyProof(15, proof);
```

See [Developer Portal](https://hskpassport.gudman.xyz/developers) for the full guide.

---

## Repository Structure

```
contracts/       — Hardhat project: Solidity contracts + 26 tests + deploy scripts
frontend/        — Next.js 16 app: user + issuer + demo + ecosystem + developer portal
backend/         — Fastify + SQLite: indexer, REST API, KYC workflow
sdk/             — @hsk-passport/sdk: TypeScript SDK + React component
schemas/         — W3C VC-aligned JSON-LD credential schemas
PROTOCOL.md      — Protocol specification
ROADMAP.md       — Public roadmap (Q2–Q4 2026)
SECURITY.md      — Disclosure policy and known limitations
DEMO_SCRIPT.md   — 2-minute demo video script
```

---

## Running Locally

```bash
# Contracts
cd contracts && npm install && npx hardhat test       # 26 passing

# Backend
cd backend && npm install && npm run build && npm start

# Frontend
cd frontend && npm install && npm run dev

# SDK
cd sdk && npm install && npx tsc
```

---

## Test Results

```
26 passing

  CredentialRegistry — schema registration, revocation, access control
  HSKPassport — group management, issuance, batch operations
  Delegate System — per-group approval and revocation (isolation tested)
  ZK Proof Verification — Groth16 proof generation + on-chain verification
  GatedRWA — caller-bound proof mint, nullifier reuse rejection, wrong-caller rejection
  DemoIssuer — self-service flow + double-claim prevention
```

---

## License

MIT
