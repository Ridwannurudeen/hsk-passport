# Audit Round 1 — Contracts & initial design

**Scope**: `contracts/` (all Solidity), initial deployment, pre-Sumsub integration.

## HIGH

### H1 — Revoked issuers could still issue through their delegates
**File**: `HSKPassport.sol`
**Issue**: `onlyGroupIssuerOrDelegate` accepted calls if the caller was a delegate, even if the group's original issuer had been revoked. This defeated the entire offboarding mechanism.
**Fix**: Split into `onlyGroupIssuer` (strict, checks approvedIssuers) and `onlyGroupIssuerOrDelegate` (checks that the group's stored issuer is still approved). Now when an issuer is revoked, every delegate they approved also loses power.
**Test**: `SecurityInvariants.test.ts — H1: Issuer revocation freezes all their groups`.

### H2 — HashKey KYC bridge did not prevent sybil identities
**File**: `HashKeyKYCImporter.sol`
**Issue**: A user with a valid HashKey KYC SBT could mint multiple distinct Semaphore commitments, binding the same real identity to multiple anonymous handles.
**Fix**: Added `boundCommitment[wallet]` and `commitmentSource[commitment]` mappings. One wallet → one commitment; one commitment → one source. `releaseBinding()` only callable after SBT revoked.
**Test**: `SecurityInvariants.test.ts — H2: HashKey KYC importer anti-sybil`.

### H3 — `CredentialReputation` threshold proof did not bind to commitment
**Issue**: A user could prove "reputation ≥ threshold" by borrowing another user's reputation score — the proof didn't cryptographically bind to the caller's commitment.
**Fix**: Removed `CredentialReputation` from the core production path; labeled explicitly as roadmap-only in the contract's NatSpec. Real binding requires a ZK range-proof circuit that we'll ship in a future milestone.

### H4 — Unauthenticated backend KYC review
**File**: `backend/src/server.ts`
**Issue**: The KYC review endpoint allowed any caller to approve a pending request, including a malicious frontend.
**Fix**: Added wallet-signed authentication with nonce + 5-min window; recovered address must match an `approvedIssuers[...]` call on-chain.
**Related**: In a later round this was further hardened with single-use nonces and signed-read auth on queue reads.

## MEDIUM

### M1 — Delegate privilege escalation
**File**: `HSKPassport.sol`
**Issue**: Delegates could grant more delegates and deactivate groups.
**Fix**: Only the group's original issuer can grant delegates or deactivate the group. Delegates can only issue and revoke credentials.

### M2 — `CredentialExpiry` module stored timestamps but was never enforced
**Fix**: Removed from the v1 core path; re-introduced in Round 3 with actual on-chain enforcement via `verifyCredentialWithExpiry`.

### M3 — Documentation inconsistent on caller-bound proofs
**Fix**: Unified the caller-bound pattern across README, PROTOCOL.md, docs page, and all reference dApp contracts.

### M4 — `README.md` overstated production-readiness
**Fix**: Split "production-path" from "roadmap" with explicit labeling. Added `/roadmap` page with honest threat model.

### M5 — Only one test file covered the main contract
**Fix**: Added `SecurityInvariants.test.ts` covering all HIGH + M1 fixes. Test count went 12 → 26.
