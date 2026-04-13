# HSK Passport

**The privacy-preserving compliance layer for regulated RWA and institutional DeFi on HashKey Chain.**

Verify once. Prove anywhere. Reveal nothing.

Built for the [HashKey Chain Horizon Hackathon 2026](https://dorahacks.io/hackathon/2045) — ZKID Track.

- **Live**: https://hskpassport.gudman.xyz
- **Protocol spec**: [PROTOCOL.md](PROTOCOL.md)
- **Security policy**: [SECURITY.md](SECURITY.md)
- **Roadmap**: [ROADMAP.md](ROADMAP.md)

---

## The Problem

Every regulated product on HashKey Chain — silver-backed RWAs, tokenized funds, accredited-only DeFi — needs compliance. Today that means:

- Users submit the same KYC to every dApp separately
- Wallets get permanently linked to real identities on-chain
- dApps build or buy their own KYC stack
- Public whitelists expose who participates in what

HSK Passport replaces all of that with one privacy-preserving primitive.

## The Product (core, production-path)

1. **KYC-verified access** — any HashKey Chain dApp can gate functions behind proof of KYC without seeing the user's identity
2. **Accredited-investor access** — tiered capital products (e.g., uncapped lending, institutional pools) can require proof of accreditation
3. **Jurisdiction-aware access** — pools can accept users from a set of approved jurisdictions (e.g., HK/SG/AE) without revealing which one

This is the entire core value proposition. Everything else is roadmap.

## What Makes It HashKey-Native

- **Bridges from HashKey DID**: users with a `.key` DID can mint HSK Passport credentials tied to their existing identity
- **Imports HashKey Exchange KYC**: Level 1/2/3 SBT holders import their verification status without re-submitting documents
- **W3C VC-aligned schemas** for regulatory compatibility
- **Designed around HashKey's compliance-first L2 positioning** — SFC license, Silver RWA, regulated fund ETFs

## How It Works

```
┌─────────────┐     issues     ┌──────────────────┐     queries     ┌─────────────┐
│  Issuer     │─ commitment ──>│  HSK Passport    │<── proof ───────│  dApp       │
│ (KYC svc,   │   (on-chain)   │  (Semaphore v4)  │  (yes/no bool)  │  (any RWA/  │
│  exchange)  │                │                  │                 │  DeFi)      │
└─────────────┘                └──────────────────┘                 └─────────────┘
                                        ▲
                                        │ ZK proof (client-side,
                                        │ in-browser WASM)
                                        │
                                  ┌──────────────┐
                                  │     User     │
                                  │ (the holder) │
                                  └──────────────┘
```

Off-chain KYC stays off-chain. Only a 32-byte commitment goes on-chain. Users prove membership via zero-knowledge without revealing which member they are. dApps get a simple boolean.

## What's Live On Testnet

### Core production-path contracts
| Contract | Address | Purpose |
|---|---|---|
| HSKPassport | [`0xb430F303...5c64`](https://hashkey-testnet.blockscout.com/address/0xb430F30376344303560c0554DC94766D780a5c64) | Credential groups, issuance, verification |
| CredentialRegistry | [`0x20265dAe...9De1`](https://hashkey-testnet.blockscout.com/address/0x20265dAe4711B3CeF88D7078bf1290f815279De1) | Schema registry (W3C VC aligned) |
| Semaphore v4 | [`0xd09e8Aec...CFE9`](https://hashkey-testnet.blockscout.com/address/0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9) | ZK proof verification |
| HashKeyDIDBridge | [`0x0cB4c519...A2a5`](https://hashkey-testnet.blockscout.com/address/0x0cB4c519F984A2f43c1ca217CDB5095dB3b3A2a5) | Bridge `.key` DIDs → credentials |
| HashKeyKYCImporter | [`0x7A40694E...A117`](https://hashkey-testnet.blockscout.com/address/0x7A40694Eda3046706Fe89db771e88Cf3A979A117) | Bridge HashKey Exchange KYC → credentials |

### Reference dApps
| dApp | Use case |
|---|---|
| GatedRWA (`hSILVER`) | KYC-gated regulated RWA mint (emulates HashKey Silver Token flow) |
| KYCGatedAirdrop (`hPILOT`) | Sybil-resistant airdrop via action-scoped nullifiers |
| KYCGatedLending | Retail + accredited tiered borrow (requires ACCREDITED_INVESTOR proof above threshold) |
| JurisdictionGatedPool | Accept users from {HK, SG, AE} without revealing which |

### Credential groups
KYC_VERIFIED (20), ACCREDITED_INVESTOR (21), HK_RESIDENT (22), SG_RESIDENT (23), AE_RESIDENT (24)

## Security Properties (what we enforce today)

- **Caller-bound proofs**: `GatedRWA.kycMint` requires `proof.message == uint256(uint160(msg.sender))` — prevents front-running
- **Per-group delegate isolation**: delegates for group A cannot issue in group B
- **Issuer offboarding**: revoking an issuer immediately freezes all their groups (including delegate-gated issuance)
- **Split delegate roles**: delegates can only issue credentials, not grant more delegates or deactivate groups
- **Anti-sybil bridges**: HashKey KYC/DID bridges enforce one-source → one-commitment, preventing one KYC'd human from minting multiple anonymous identities
- **Revocation-aware proofs**: client-side proof generation filters `CredentialRevoked` events so revoked credentials immediately fail
- **Authenticated issuer backend**: KYC review endpoint requires wallet-signed authorization matching an approved issuer

## Status — Honest Assessment

**Production-path (core):**
- HSKPassport credential lifecycle: working
- Caller-bound proofs: enforced
- Revocation + offboarding: enforced
- HashKey DID bridge + HashKey KYC importer: working with mocks (real contracts activate once HashKey deploys on HashKey Chain)
- 4 reference dApp integrations: working on testnet

**Roadmap — built but NOT production-hardened (clearly labeled in-code):**
- CredentialExpiry (not integrated into verify path)
- CredentialReputation (threshold proof does not bind to commitment — circuit work required)
- IssuerRegistry staking (permissionless reputation tracking — needs on-chain issuance hooks)
- Governance timelock (deployed but not yet transferred to multi-sig)

These are shipped as scaffolding for Q3 2026 work and clearly documented as not-yet-enforced.

## Tech Stack

- **ZK**: Semaphore v4 (Groth16, EdDSA identities, LeanIMT)
- **Contracts**: Solidity 0.8.23, Hardhat
- **Frontend**: Next.js 16, TypeScript, Tailwind, ethers v6
- **Client-side KYC**: Tesseract.js OCR + face-api.js matching + liveness detection, all in-browser (zero data leaves device)
- **Backend**: Fastify + better-sqlite3 indexer with wallet-signed review auth

## Developer Integration

Gate any function behind ZK KYC:

```solidity
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IHSKPassport {
    function verifyCredential(uint256 groupId, ISemaphore.SemaphoreProof calldata proof)
        external view returns (bool);
}

contract MyRWA {
    IHSKPassport constant passport =
        IHSKPassport(0xb430F30376344303560c0554DC94766D780a5c64);

    function mint(ISemaphore.SemaphoreProof calldata proof) external {
        // REQUIRED: bind proof to caller to prevent front-running
        require(
            proof.message == uint256(uint160(msg.sender)),
            "proof must be bound to caller"
        );
        require(passport.verifyCredential(20, proof), "KYC required");
        // ... your logic
    }
}
```

Frontend:

```ts
import { HSKPassport } from "hsk-passport-sdk";

const passport = HSKPassport.connect("hashkey-testnet", signer);
const identity = passport.createIdentity(walletSignature);
const callerAddress = await signer.getAddress();
const proof = await passport.generateProof(identity, 15, "mint-rwa", BigInt(callerAddress));
```

See [/developers](https://hskpassport.gudman.xyz/developers) for the full guide.

## Repository Structure

```
contracts/       Hardhat: Solidity contracts + tests + deploy scripts
frontend/        Next.js 16: KYC, issuer dashboard, demo, ecosystem, developer portal
backend/         Fastify + SQLite: indexer, KYC workflow API, auto-issuer (demo)
sdk/             hsk-passport-sdk — TypeScript SDK + React component
schemas/         W3C VC-aligned JSON-LD credential schemas
```

## Running Locally

```bash
# Contracts
cd contracts && npm install && npx hardhat test

# Backend
cd backend && npm install && npm run build && npm start

# Frontend
cd frontend && npm install && npm run dev

# SDK
cd sdk && npm install && npx tsc
```

## License

MIT

---

**Brutally honest**: The core credential gate is real, tested, and safe. The reputation + expiry modules are scaffolding with clear warnings in the source. We'd rather over-disclose limits than over-claim.
