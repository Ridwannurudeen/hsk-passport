# @hsk-passport/sdk

[![npm version](https://img.shields.io/npm/v/@hsk-passport/sdk.svg)](https://www.npmjs.com/package/@hsk-passport/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**TypeScript SDK for HSK Passport — privacy-preserving ZK credentials on HashKey Chain.**

Add ZK KYC verification to your dApp in under 10 minutes. Users prove credentials without revealing identity. Your contract gets a boolean. Zero personal data on-chain.

---

## Install

```bash
npm install @hsk-passport/sdk
# Peer dependencies (if not already in your project)
npm install ethers @semaphore-protocol/identity @semaphore-protocol/group @semaphore-protocol/proof
```

## Quick Start

```typescript
import { HSKPassport } from "@hsk-passport/sdk";
import { BrowserProvider } from "ethers";

// 1. Connect
const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const passport = HSKPassport.connect("hashkey-testnet", signer);

// 2. Create identity from wallet signature (deterministic)
const sig = await signer.signMessage("HSK Passport: Generate my identity");
const identity = passport.createIdentity(sig);

// 3. Check what credentials the user holds
const creds = await passport.getCredentials(identity);
// [{ groupId: 15, groupName: "KYC_VERIFIED", hasCredential: true, ... }]

// 4. Generate a ZK proof for a credential
const callerAddress = await signer.getAddress();
const proof = await passport.generateProof(
  identity,
  15,                      // KYC_VERIFIED group
  "mint-my-token",         // action scope (for sybil resistance)
  BigInt(callerAddress)    // message bound to caller (prevents front-running)
);

// 5. Verify on-chain (read-only)
const valid = await passport.verifyProof(15, proof);
```

## React Component

```tsx
import { HSKPassportGate } from "@hsk-passport/sdk/react";

<HSKPassportGate
  groupId={15}                   // KYC_VERIFIED
  scope="mint-silver-token"
  identitySecret={walletSignature}
  signer={signer}
  onVerified={async (proof) => {
    // User is KYC-verified — submit proof to your contract
    const tx = await myContract.kycMint(proof);
    await tx.wait();
  }}
  onError={(err) => toast.error(err.message)}
>
  Verify KYC & Mint
</HSKPassportGate>
```

## Solidity Integration

```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IHSKPassport {
    function verifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool);
}

contract MyRWAToken {
    IHSKPassport public constant passport =
        IHSKPassport(0x79A0E1160FA829595f45f0479782095ed497d5E6);

    uint256 public constant KYC_GROUP = 15;
    mapping(uint256 => bool) public usedNullifiers;

    function kycMint(ISemaphore.SemaphoreProof calldata proof) external {
        // Bind proof to caller — prevents front-running
        require(
            proof.message == uint256(uint160(msg.sender)),
            "proof must be bound to caller"
        );
        require(!usedNullifiers[proof.nullifier], "nullifier already used");
        require(
            passport.verifyCredential(KYC_GROUP, proof),
            "KYC proof required"
        );

        usedNullifiers[proof.nullifier] = true;
        // ... your mint logic
    }
}
```

## API Reference

### `HSKPassport.connect(network, signerOrProvider?)`

Connect to HSK Passport on a network.

- `network`: `"hashkey-testnet"` (more networks added after mainnet deploy)
- `signerOrProvider`: an ethers `Signer` (for transactions) or `JsonRpcProvider` (read-only)

Returns an `HSKPassport` instance.

### `passport.createIdentity(secret)`

Create a deterministic Semaphore identity from a secret (wallet signature recommended).

- `secret`: string (e.g., the user's wallet signature)

Returns a Semaphore `Identity`.

### `passport.getCredentials(identity)`

Get the credential status of an identity across all configured groups.

Returns `CredentialStatus[]`:
```typescript
[
  { groupId: 15, groupName: "KYC_VERIFIED", hasCredential: boolean, schemaHash: string },
  { groupId: 16, groupName: "ACCREDITED_INVESTOR", hasCredential: boolean, schemaHash: string },
  ...
]
```

### `passport.generateProof(identity, groupId, scope, message)`

Generate a Groth16 ZK proof of group membership.

- `identity`: the user's Semaphore identity
- `groupId`: the credential group to prove membership in
- `scope`: unique scope per action (string or number) — enables per-action sybil resistance via nullifiers
- `message`: bound to the proof (typically `BigInt(callerAddress)` to prevent front-running)

Returns `HSKPassportProof` — formatted for on-chain submission.

### `passport.verifyProof(groupId, proof)`

Read-only on-chain verification (does not consume the nullifier).

Returns `Promise<boolean>`.

### `passport.submitProof(groupId, proof)`

On-chain validation that consumes the nullifier (prevents reuse for the same scope).

Returns `Promise<TransactionReceipt>`. Requires signer.

### `passport.getGroupInfo(groupId)`

Get on-chain group metadata.

Returns:
```typescript
{
  groupId: number,
  name: string,
  issuer: string,
  memberCount: number,
  active: boolean,
  schemaHash: string,
}
```

## Credential Groups (Testnet)

| Group ID | Name | Description |
|----------|------|-------------|
| 15 | `KYC_VERIFIED` | Standard KYC verification |
| 16 | `ACCREDITED_INVESTOR` | Professional/accredited investor |
| 17 | `HK_RESIDENT` | Hong Kong SAR resident |
| 18 | `SG_RESIDENT` | Singapore resident |
| 19 | `AE_RESIDENT` | UAE resident |

## Network Configuration

### HashKey Chain Testnet (chain ID 133)

```typescript
const passport = HSKPassport.connect("hashkey-testnet");
```

| Contract | Address |
|----------|---------|
| HSKPassport | `0x79A0E1160FA829595f45f0479782095ed497d5E6` |
| CredentialRegistry | `0x20265dAe4711B3CeF88D7078bf1290f815279De1` |
| CredentialExpiry | `0x11fF27Bf3F0Bbf45a5dC43210359c56E45E97770` |
| CredentialReputation | `0x39cc2a483Cc22Cf7B461759404642Fa528df96D7` |
| HashKeyDIDBridge | `0x37e855626a5cF51e808F96efe4455Dc225724472` |
| IssuerRegistry | `0x79682C30670f374BD13F40C78c828a32F47582b3` |

### HashKey Chain Mainnet

Coming in Q2 2026 after security audit.

## Privacy Properties

### What the protocol reveals
- A valid proof exists for the specified group
- The Merkle tree root used
- The nullifier hash (deterministic per identity + scope)
- The wallet address submitting the proof

### What the protocol does NOT reveal
- Which group member generated the proof
- The user's identity commitment
- The user's personal data (name, documents, jurisdiction)
- Cross-dApp activity (different scopes → different nullifiers)

### Anonymity guarantees
- Proof privacy scales with group size
- For meaningful privacy, ensure groups have ≥100 active members
- The SDK warns when the anonymity set is below 5

## Related Packages

- [`@semaphore-protocol/identity`](https://www.npmjs.com/package/@semaphore-protocol/identity) — Semaphore v4 identity generation
- [`@semaphore-protocol/proof`](https://www.npmjs.com/package/@semaphore-protocol/proof) — Groth16 proof generation
- [`ethers`](https://www.npmjs.com/package/ethers) — Ethereum interaction library

## Links

- **Live demo**: https://hskpassport.gudman.xyz
- **Developer portal**: https://hskpassport.gudman.xyz/developers
- **Protocol spec**: [PROTOCOL.md](https://github.com/Ridwannurudeen/hsk-passport/blob/master/PROTOCOL.md)
- **GitHub**: https://github.com/Ridwannurudeen/hsk-passport

## License

MIT © HSK Passport
