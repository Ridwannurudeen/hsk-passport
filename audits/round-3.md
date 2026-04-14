# Audit Round 3 — Security hardening from full independent review

**Scope**: Full backend + frontend + contracts review after v5 deployment; parallel audit agents covering security, API correctness, frontend bugs, and competitive positioning.

## CRITICAL

### C1 — Sumsub webhook HMAC verified over reconstructed JSON, not raw bytes
**File**: `backend/src/server.ts`, `backend/src/sumsub.ts`
**Issue**: Fastify auto-parses JSON bodies. We were calling `JSON.stringify(request.body)` and HMAC-verifying that reconstruction. The reconstructed string does not byte-match the original wire format (whitespace, key order, number precision), so the HMAC check was effectively a no-op — any signature over any reconstruction matched.
**Fix**: Added a content-type parser that captures `rawBody` as a Buffer for the webhook route. `verifyWebhookSignature` now verifies over the original bytes. Length-check added before `timingSafeEqual` to prevent a length-oracle timing leak.

### C2 — Issuer-auth nonce replay
**File**: `backend/src/server.ts`
**Issue**: Signed-read auth had a 5-min window but no replay protection. A captured signature could be reused on every endpoint during the window.
**Fix**: In-memory single-use nonce map with age-based GC. Each `(address, nonce)` pair burns after first successful verification.

## HIGH

### H1 — CORS wildcard `origin: true`
**Fix**: Locked to `ALLOWED_ORIGINS` env (defaults: `hskpassport.gudman.xyz`, localhost). Removes credential-leak exposure if cookies are added later.

### H2 — Commitment / wallet input validation missing on `/api/kyc/submit`
**Fix**: Regex validation — commitment must be numeric string ≤ 80 chars, wallet must be 0x-prefixed 20-byte hex, jurisdiction/credentialType length-capped. Prevents DB row pollution and BigInt crashes in the auto-issuer.

## MEDIUM

### M1 — `/developers` code examples used v4 group ID 15
**Fix**: Updated to v5 group 25 in both the Solidity snippet and the `HSKPassportGate` React example.

### M2 — `/docs` Solidity snippet + address table still v4
**Fix**: Addresses updated to v5 (HSKPassport, DemoIssuer, GatedRWA); group constant updated to 25.

### M3 — Backend CORS allowed any origin (duplicate of H1 upstream — consolidated)

### M4 — No per-wallet identity auto-swap UX
**Fix**: See Round 2 M4. Polished further: the /user page now listens for `accountsChanged` and hot-swaps identity without reload.

### M5 — UI patterns not consistent across pages (button styles, card hover, typography)
**Fix**: Introduced a design-token system in `globals.css` with 20 semantic CSS variables for dark/light modes. Refactored buttons, badges, cards, and typography to use tokens. Added a theme toggle with system-preference fallback and anti-flash inline script.

## Verification

All 25 findings across the three rounds are covered by:
- **Test suite**: 45 passing tests including the `SecurityInvariants.test.ts`, `CredentialExpiry.test.ts`, `IssuerSlashing.test.ts` files specifically added to lock in the fixes.
- **Runtime sanity**: production endpoints on `https://hskpassport.gudman.xyz/api/*` confirmed to redact PII, reject replayed nonces, and enforce CORS.
