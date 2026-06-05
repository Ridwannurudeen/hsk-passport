# External Audit — Scope & RFP

This document is the scope package for the **third-party security audit** that
gates HSK Passport's full mainnet launch (HashKey Chain, chain 177). Share it
with audit firms (Trail of Bits, OpenZeppelin, Spearbit, …) to request a quote.

- **Repository:** https://github.com/Ridwannurudeen/hsk-passport
- **Commit to audit:** _to be frozen and tagged at engagement start_ (see [Logistics](#logistics))
- **Toolchain:** Hardhat · Solidity `>=0.8.23 <0.9.0` · Circom 2.x · Semaphore v4 (Groth16, bn254)
- **Prior review:** 3 internal rounds, 26 findings closed — see [audit history](./README.md)
- **Test suite:** 104 contract tests (`contracts/test`), all passing

## System overview

HSK Passport is a reusable, privacy-preserving compliance layer. A user verifies
once (Sumsub KYC), receives a Semaphore v4 zero-knowledge credential bound to
their wallet, and any HashKey Chain dApp can check eligibility with a single
`verifyCredential` call. The regulator sees full KYC off-chain; the chain sees
only a group-membership proof — no PII. See [`PROTOCOL.md`](../PROTOCOL.md).

## In scope

LOC counts exclude comments-only lines only loosely; treat them as sizing aid.

### Tier 1 — core protocol (must audit)

| Contract | LOC | Role |
|---|---:|---|
| `HSKPassport.sol` | 429 | Credential groups, issuance, ZK verify/validate, pauser, ownership |
| `IssuerRegistry.sol` | 230 | Issuer staking, slashing, timelock-controlled authority |
| `CredentialRegistry.sol` | 132 | Schema registry, revocation records |
| `CredentialExpiry.sol` | 118 | Validity-window / freshness enforcement |
| `HSKPassportTimelock.sol` | 29 | 48h `TimelockController` for governance |
| `HSKPassportVerifier.sol` | 57 | Base contract / modifiers for consumer dApps |

### Tier 1 — circuit

| Circuit | LOC | Role |
|---|---:|---|
| `circuits/src/credential_freshness.circom` | 137 | Per-prover issuance-window proof (v6 freshness) |

### Tier 2 — extended protocol (in scope, lower blast radius)

| Contract | LOC | Role |
|---|---:|---|
| `CredentialReputation.sol` | 168 | Issuer/credential reputation scoring |
| `AnonymitySetGate.sol` | 163 | Hard floor + soft warning on group size |
| `JurisdictionSetVerifier.sol` | 125 | Jurisdiction-scoped credential checks |
| `HashKeyDIDBridge.sol` | 197 | Compose credentials with HashKey `.key` DIDs |
| `HashKeyKYCImporter.sol` | 172 | Import path from HashKey KYC |
| `HashKeyKycSBTAdapter.sol` | 61 | SBT→ZK adapter |

**Total in-scope:** ~1,880 LOC Solidity + 137 LOC Circom.

## Out of scope

- **`DemoIssuer.sol`** — testnet-only faucet that lets *anyone* self-issue a
  credential. It must never be deployed to mainnet; flagged here so its presence
  in the repo isn't mistaken for production code.
- **Reference consumer dApps** — `GatedRWA.sol`, `KYCGatedAirdrop.sol`,
  `KYCGatedLending.sol`. These are integration examples, not protocol contracts.
  Optional: a light review of the gate pattern they demonstrate is welcome since
  integrators copy it.
- **Mocks & deploy helpers** — `Mock*.sol`, `SemaphoreDeploy.sol`.
- **Upstream dependencies** — Semaphore v4 contracts/circuits and their
  Ethereum-Foundation trusted setup are assumed audited; we ask only that the
  audit confirm our *integration* with them is sound.
- Backend (`backend/`), frontend (`frontend/`), and SDK (`sdk/`) — out of scope
  for this contract+circuit engagement (separate review if desired).

## Areas of concern — please focus

1. **ZK soundness & integration** — that `credential_freshness.circom` proves
   what we claim, and that nullifier/scope/message binding in `HSKPassport`
   prevents proof replay, front-running, and cross-action linkage.
2. **Anti-sybil** — issuance-side (one KYC → one commitment) and use-side
   (deterministic nullifier per `(identity, scope)`).
3. **Governance** — the timelock handoff (slashing authority transferred;
   ownership handoff pending), pauser asymmetry (pauser can pause, only owner
   can unpause), and slashing flows in `IssuerRegistry`.
4. **Freshness model edge cases** — group-level vs per-prover expiry semantics
   in `CredentialExpiry` / `verifyCredentialWithExpiry`.
5. **Known, accepted limitations** (do not re-litigate, but confirm scoping):
   backend-correlation risk (commitment ↔ Sumsub applicant), anonymity-set floor
   not yet enforced on-chain, no biometric binding. See [audit history](./README.md).

## Deployment targets

- **Testnet (chain 133):** full live stack; credentials issue here today.
- **Mainnet (chain 177):** `HSKPassport` v2 deployed in **safe mode** — zero
  credential groups, deployer-only issuer, inert. It stays inert until this
  audit completes; that is the gate. `IssuerRegistry` is live for real-money
  issuer staking; its `slashingAuthority` is already the 48h timelock.

## Logistics

1. **Freeze & tag** the commit to audit; share the tag + this scope.
2. **Engagement** — estimated 6–8 weeks for ~1,900 LOC + one circuit.
3. **Remediation buffer** — we fix findings; auditor re-reviews.
4. **Publish** — final report committed under `audits/` and linked from the
   roadmap; then execute mainnet **Phase B** ownership handoff (see
   [`RUNBOOK.md`](../RUNBOOK.md) §5).

## Contact

Private disclosure / engagement contact per [`SECURITY.md`](../SECURITY.md).
