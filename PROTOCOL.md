# HSK Passport Protocol Specification

**Spec version**: 1.1.0
**Deployed protocol version**: v5 (testnet)
**Status**: Testnet — mainnet launch Q2 2026
**Chain**: HashKey Chain (OP Stack L2 — testnet chain ID 133, mainnet chain ID 177)
**ZK Backend**: Semaphore v4 (Groth16 proofs, bn128 curve, Poseidon hash, LeanIMT)

---

## 1. Overview

HSK Passport is a privacy-preserving credential verification protocol for HashKey Chain. It enables users to prove they hold credentials (KYC verification, accredited investor status, residency) without revealing any personal information.

The protocol separates three roles:

- **Issuers**: Trusted entities (e.g., HashKey Exchange) that verify users off-chain and issue on-chain credentials
- **Holders**: Users who store credentials and generate zero-knowledge proofs
- **Verifiers**: dApps that verify proofs on-chain to gate access to services

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      HSK Passport Protocol                       │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐    ┌────────────┐  │
│  │ Credential       │    │ HSKPassport       │    │ Semaphore  │  │
│  │ Registry         │───>│ (Group Manager)   │───>│ v4 Core    │  │
│  │                  │    │                   │    │            │  │
│  │ Schema types     │    │ Credential groups │    │ Merkle     │  │
│  │ Revocation state │    │ Issuer management │    │ trees      │  │
│  │ Schema URIs      │    │ Delegate system   │    │ ZK verify  │  │
│  └─────────────────┘    └──────────────────┘    └────────────┘  │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐                    │
│  │ HSKPassport      │    │ DemoIssuer       │                    │
│  │ Verifier         │    │ (Self-service)    │                    │
│  │                  │    │                   │                    │
│  │ Base contract    │    │ For testing &     │                    │
│  │ for dApps        │    │ hackathon demos   │                    │
│  └─────────────────┘    └──────────────────┘                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Credential Lifecycle

### 3.1 Schema Registration

An issuer registers a credential type in the CredentialRegistry:

```
registerSchema(schemaHash, schemaURI, revocable)
```

- `schemaHash`: Keccak256 of the canonical JSON schema
- `schemaURI`: IPFS or HTTPS URI to the W3C VC-aligned JSON-LD schema
- `revocable`: Whether individual credentials can be revoked

### 3.2 Group Creation

The issuer creates a Semaphore group linked to the schema:

```
createCredentialGroup(name, schemaHash) → groupId
```

Each group is a Merkle tree of identity commitments. The group admin is the HSKPassport contract, with issuance delegated to approved issuers.

### 3.3 Credential Issuance

After off-chain verification, the issuer adds the user's identity commitment:

```
issueCredential(groupId, identityCommitment)
```

The identity commitment is a hash of the user's EdDSA public key (Semaphore v4). It reveals nothing about the user's identity.

### 3.4 Proof Generation (Client-Side)

The user generates a Groth16 zero-knowledge proof in their browser:

1. Reconstruct the group's Merkle tree from on-chain events
2. Compute a Merkle inclusion proof for their commitment
3. Generate a Groth16 proof using snarkjs WASM

The proof demonstrates: "I know a private key whose commitment is a leaf in this Merkle tree" — without revealing which leaf.

**Proof parameters:**
- `message`: **Caller-bound signal** — must equal `uint256(uint160(msg.sender))` for any dApp that consumes the proof. This binds the proof to the calling wallet and prevents front-running / proof-replay by a third party.
- `scope`: Nullifier scope for sybil resistance (unique per action — typically `keccak256("dapp:action")`)
- `nullifier`: Deterministic from identity + scope (prevents double-proving per scope)

### 3.5 On-Chain Verification

A dApp verifies the proof by calling:

```solidity
// Read-only verification (can reuse proof)
passport.verifyCredential(groupId, proof) → bool

// Validation with nullifier tracking (prevents reuse per scope)
passport.validateCredential(groupId, proof)
```

Verification uses the bn128/alt_bn128 elliptic curve precompiles (ecAdd, ecMul, ecPairing) at addresses 0x06, 0x07, 0x08. Gas cost: ~241,000 per verification.

### 3.6 Revocation

An issuer can revoke a credential:

```
// Remove from Semaphore group (future proofs fail)
revokeCredential(groupId, identityCommitment, merkleProofSiblings)

// Mark as revoked in registry (metadata tracking)
registry.revokeCredential(schemaHash, identityCommitment)
```

After revocation, the user's commitment is removed from the Merkle tree. Any proof generated against the old tree root will expire based on the group's `merkleTreeDuration` (default: 1 hour).

---

## 4. Privacy Guarantees

### What the protocol reveals:
- A valid proof exists for the specified group
- The Merkle tree root used in the proof
- The nullifier hash (deterministic per identity + scope)
- That the proof was submitted by a specific wallet address

### What the protocol does NOT reveal:
- Which group member generated the proof
- The user's identity commitment
- The user's EdDSA private key
- Any personal information (name, documents, address)
- The link between the wallet submitting the proof and the credential holder

### Unlinkability:
- Different scopes produce different nullifiers from the same identity
- A verifier cannot link two proofs from the same user across different scopes
- The same user can prove credentials to multiple dApps without cross-dApp tracking

### Limitations:
- Same scope + same identity = same nullifier (linkable within a scope)
- Group membership changes are visible on-chain (add/remove events)
- The total number of group members is public

---

## 5. Compliance Model

HSK Passport is designed for HashKey Chain's compliance-first architecture.

### Aggregate Reporting (Privacy-Preserving)
- Total KYC-verified users: `credentialGroups[groupId].memberCount`
- Total verifications: count of `CredentialVerified` events
- Credential types: queryable from CredentialRegistry
- Revocation status: `registry.isRevoked(schemaHash, commitment)`

### Regulatory Compatibility
- **Issuers retain off-chain KYC records** — the protocol does not replace KYC, it bridges it to on-chain verification
- **Revocation is immediate** — regulators can require an issuer to revoke a credential, and all future proofs fail
- **Audit trail** — all issuance and revocation events are on-chain and timestamped
- **Jurisdiction-scoped groups** — separate groups for different jurisdictions (e.g., HK_RESIDENT)

### Integration with HashKey DID (Future)
HSK Passport is designed to compose with HashKey's existing DID system:

1. User registers a HashKey DID (`alice.key`) with KYC
2. HashKey's KYC service (as an approved issuer) adds the user's Semaphore commitment to the KYC_VERIFIED group
3. The user's DID and Semaphore identity are linked off-chain but unlinkable on-chain
4. dApps verify KYC status without knowing which DID the proof belongs to

---

## 6. Security Considerations

### Trusted Setup
Semaphore v4 uses a Groth16 trusted setup ceremony conducted by the Privacy & Scaling Explorations (PSE) team at Ethereum Foundation. The ceremony parameters are publicly verifiable.

### Precompile Dependency
Proof verification depends on the bn128 elliptic curve precompiles (EIP-196, EIP-197). These are available on HashKey Chain as an OP Stack L2.

### Issuer Trust
The protocol's security depends on issuers correctly verifying credentials off-chain. A compromised issuer could add unauthorized identity commitments. Mitigation: multi-sig issuer addresses, issuer reputation tracking, auditable issuance logs.

### Front-Running
Proofs are bound to a `message` parameter. dApps should include the caller's address in the message to prevent front-running.

---

## 7. Contract Addresses (HashKey Chain Testnet, v5)

| Contract | Address |
|----------|---------|
| HSKPassport | `0x7d2E692A08f2fb0724238396e0436106b4FbD792` |
| Semaphore v4 | `0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9` |
| CredentialRegistry | `0x20265dAe4711B3CeF88D7078bf1290f815279De1` |
| IssuerRegistry | `0x5BbAe6e90b82c7c51EbA9cA6D844D698dE2eb504` |
| Timelock (48h) | `0xb07Bc78559CbDe44c047b1dC3028d13c4f863D8A` |
| HashKeyDIDBridge | `0xF072D06adcA2B6d5941bde6cc87f41feC5F5Ea7a` |
| HashKeyKYCImporter | `0x5431ae6D2f5c3Ad3373B7B4DD4066000D681f5B8` |
| HashKeyKycSBTAdapter | `0xba9c4239A35DA84700ff8c11b35c15e00F6ff794` |
| MockKycSBT | `0x6185225D7cFF75191F93713b44EA09c31de545cD` |
| GatedRWA (hSILVER) | `0xb6955cb3e442c4222fFc3b92c322851109d0b9c9` |
| KYCGatedAirdrop (hPILOT) | `0x71c96016CBCAeE7B2Edc8b40Fec45de1d16Fb4b8` |
| KYCGatedLending | `0x37179886986bd35a4d580f157f55f249c43A0BFD` |
| JurisdictionGatedPool | `0x305f5F0b44d541785305DaDb372f118A9284Ce4D` |

**Credential groups** *(default validity)*: `KYC_VERIFIED 25 (180 d)` · `ACCREDITED_INVESTOR 26 (365 d)` · `HK_RESIDENT 27` · `SG_RESIDENT 28` · `AE_RESIDENT 29` *(residency never expires)*.
