# HSK Passport

**Privacy-preserving ZK credential verification protocol for HashKey Chain.**

Built for the [HashKey Chain Horizon Hackathon 2026](https://dorahacks.io/hackathon/2045) — ZKID Track.

**Live Demo**: [https://hskpassport.gudman.xyz](https://hskpassport.gudman.xyz)
**Protocol Spec**: [PROTOCOL.md](PROTOCOL.md)

---

## The Problem

HashKey Chain is compliance-first. Every RWA project, DeFi protocol, and institutional product needs KYC. But current approaches either:
- Expose personal data on-chain (privacy violation)
- Require each dApp to run its own KYC (expensive, fragmented)
- Use centralized whitelists (single point of failure)

## The Solution

HSK Passport uses **Semaphore v4 zero-knowledge proofs** to let users prove credentials without revealing identity. One credential check. Zero personal data on-chain. Full compliance.

```
Issuer verifies KYC off-chain → adds commitment to group on-chain
User generates Groth16 ZK proof in browser → proves group membership
dApp calls verifyCredential() → gets true/false, sees zero personal data
```

---

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌────────────┐
│ Credential       │    │ HSKPassport       │    │ Semaphore  │
│ Registry         │───>│ (Group Manager)   │───>│ v4 Core    │
│                  │    │                   │    │            │
│ Schema types     │    │ Credential groups │    │ Merkle     │
│ Revocation state │    │ Issuer/delegate   │    │ trees      │
│ W3C VC aligned   │    │ management        │    │ ZK verify  │
└─────────────────┘    └──────────────────┘    └────────────┘

┌─────────────────┐    ┌──────────────────┐
│ HSKPassport      │    │ @hsk-passport/   │
│ Verifier         │    │ sdk              │
│                  │    │                  │
│ Base contract    │    │ TypeScript SDK   │
│ for dApps        │    │ + React hooks    │
└─────────────────┘    └──────────────────┘
```

---

## Deployed Contracts (HashKey Chain Testnet)

| Contract | Address | Explorer |
|----------|---------|----------|
| SemaphoreVerifier | `0xe874E5...aC3b9A` | [View](https://hashkey-testnet.blockscout.com/address/0xe874E5DE61fa40dAf82e8916489d1B7071aC3b9A) |
| Semaphore | `0xd09e8A...34CFE9` | [View](https://hashkey-testnet.blockscout.com/address/0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9) |
| CredentialRegistry | `0x20265d...79De1` | [View](https://hashkey-testnet.blockscout.com/address/0x20265dAe4711B3CeF88D7078bf1290f815279De1) |
| HSKPassport | `0x79A0E1...d5E6` | [View](https://hashkey-testnet.blockscout.com/address/0x79A0E1160FA829595f45f0479782095ed497d5E6) |
| DemoIssuer | `0xD6CB33...28d1` | [View](https://hashkey-testnet.blockscout.com/address/0xD6CB3393B9e1E162ed3EF8187082511d20Be28d1) |
| GatedRWA (hSILVER) | `0xFc6bDE...D249` | [View](https://hashkey-testnet.blockscout.com/address/0xFc6bDE32f79ad43696abc6A2a6291bfA8AF1D249) |

**Credential Groups**: KYC_VERIFIED (15), ACCREDITED_INVESTOR (16), HK_RESIDENT (17)

**Registered Schemas**: 3 W3C VC-aligned JSON-LD schemas in `/schemas/`

---

## Quick Integration

### Solidity — Gate any function behind KYC

```solidity
import {HSKPassportVerifier} from "./HSKPassportVerifier.sol";

contract MyDApp is HSKPassportVerifier {
    constructor(address passport) HSKPassportVerifier(passport) {}

    function restrictedAction(
        ISemaphore.SemaphoreProof calldata proof
    ) external onlyCredentialHolder(3, proof) {
        // Only KYC-verified users reach here
    }
}
```

### TypeScript SDK

```typescript
import { HSKPassport } from "@hsk-passport/sdk";

const passport = HSKPassport.connect("hashkey-testnet");
const identity = passport.createIdentity(walletSignature);
const proof = await passport.generateProof(identity, 3, "my-action");
const valid = await passport.verifyProof(3, proof);
```

### React Component

```tsx
import { HSKPassportGate } from "@hsk-passport/sdk/react";

<HSKPassportGate
  groupId={3}
  scope="mint_token"
  identitySecret={signature}
  onVerified={(proof) => mintToken(proof)}
>
  Verify KYC & Mint
</HSKPassportGate>
```

---

## Protocol Features

| Feature | Description |
|---------|-------------|
| **Credential Registry** | On-chain schema registry with W3C VC-aligned JSON-LD schemas |
| **Multi-Group Credentials** | KYC, Accredited Investor, HK Resident — each independently managed |
| **Delegate System** | Approved contracts (e.g., DemoIssuer) can issue credentials on behalf of issuers |
| **Revocable Credentials** | Issuers can revoke individual credentials; proofs fail immediately |
| **Action-Scoped Nullifiers** | Sybil resistance per action via Semaphore's scope mechanism |
| **Root History** | Proofs against recent Merkle roots remain valid within a configurable window |
| **Client-Side Proofs** | Groth16 proof generation runs entirely in-browser via WASM |
| **HSKPassportVerifier** | OpenZeppelin-style base contract — one import, one modifier |
| **TypeScript SDK** | Full SDK with React hooks for frontend integration |

---

## Test Results

```
21 passing (19s)

✔ CredentialRegistry — schema registration, revocation, access control
✔ HSKPassport — group management, credential issuance, batch operations
✔ Delegate System — approve, issue via delegate, revoke
✔ ZK Proof Verification — Groth16 proof generation + on-chain verification
✔ DemoIssuer — self-service issuance, double-claim prevention
✔ GatedRWA — KYC-gated ERC-20 configuration
```

---

## Tech Stack

- **ZK**: [Semaphore v4](https://semaphore.pse.dev/) (Groth16, EdDSA identities, LeanIMT)
- **Contracts**: Solidity 0.8.23, Hardhat
- **Frontend**: Next.js 16, TypeScript, Tailwind CSS
- **SDK**: TypeScript + React
- **Chain**: HashKey Chain Testnet (Chain ID 133, OP Stack L2)
- **Proofs**: Client-side via snarkjs WASM (~241,000 gas to verify on-chain)

---

## Development

### Contracts
```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test                    # 21 tests
npx hardhat run scripts/deploy-v2.ts --network hashkey-testnet
```

### Frontend
```bash
cd frontend
npm install
npm run dev     # localhost:3000
npm run build   # production build
```

### SDK
```bash
cd sdk
npm install
npx tsc         # build to dist/
```

---

## Credential Schemas

W3C Verifiable Credential-aligned JSON-LD schemas in `/schemas/`:

- `KYCVerified.json` — Standard KYC verification
- `AccreditedInvestor.json` — Professional/accredited investor status
- `HKResident.json` — Hong Kong residency

---

## License

MIT
