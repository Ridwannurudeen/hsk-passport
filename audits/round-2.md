# Audit Round 2 — Privacy-safe backend, Composer, per-wallet identities

**Scope**: Backend API surface, frontend identity handling, ABI drift, Sumsub integration.

## HIGH

### H1 — Public KYC queue leaked wallets and jurisdictions
**File**: `backend/src/server.ts`
**Issue**: `/api/kyc/queue` returned raw DB rows including `wallet_address`, `jurisdiction`, and reviewer metadata to any caller. Directly contradicted the privacy pitch.
**Fix**: Endpoint now redacts all PII unless the caller signs a wallet-auth header that recovers to an on-chain approved issuer. Added `redactKYC()` sieve.

### H2 — Auto-issuer always-on
**File**: `backend/src/auto-issuer.ts`
**Issue**: The auto-approval bot ran by default, auto-approving pending KYC requests after 30s without human review. Acceptable for a demo, dangerous if the service was ever deployed for real traffic.
**Fix**: Gated behind `DEMO_AUTO_APPROVE=true` env flag. Logs a clear "Disabled" message otherwise.

### H3 — v4→v5 contract address drift across repo
**Issue**: README, PROTOCOL.md, docs page, developers page, homepage code snippet, SDK ABI all referenced v4 addresses (`0xb430…`) and group IDs (15–24) after v5 deployed. A judge or developer copy-pasting would integrate against dead contracts.
**Fix**: Swept and updated every reference to v5 addresses (`0x7d2E…`) and group IDs 25–29.

## MEDIUM

### M1 — Governance claim overstated on `/governance`
**Fix**: Page now says "Roadmap — Phase 1 of 2 live" with a yellow badge; explicitly distinguishes "timelock deployed and operational" from "multi-sig handoff planned."

### M2 — SDK ABI drift
**File**: `sdk/src/abi.ts`
**Issue**: Referenced old `approvedDelegates(address)` function signature. Contract uses `groupDelegates(uint256 groupId, address delegate)`. SDK users would get ABI decode errors.
**Fix**: Updated SDK ABI and frontend ABI to match current contract.

### M3 — Frontend ABI missing `schemaHash` in `CredentialGroup` tuple
**Fix**: Struct and return type updated.

### M4 — Wallet switch in MetaMask did not swap the stored identity
**Issue**: Per-user commitment is deterministic from wallet signature. Switching MetaMask accounts left the old identity loaded, meaning the same user could not test with a fresh identity.
**Fix**: Refactored `semaphore.ts` to store identities in a map keyed by wallet address. Switching MetaMask silently loads the matching identity (or shows "create identity" if new). No banners, no manual reset needed.

### M5 — In-browser KYC flow could be bypassed with a printed photo or reused face
**Issue**: The "all-in-browser" KYC demo had no document authenticity, no proper liveness, no cross-applicant face dedup.
**Fix**: Moved in-browser flow to `/research` with explicit "Research Mode — not a verification path" labeling. `/kyc` now goes straight to Sumsub (the real KYC provider). Added SANDBOX MODE badge so judges know what they're seeing.
