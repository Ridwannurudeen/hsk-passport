# Blind-issuance migration — retiring the correlating `/kyc` path (CRITICAL #2)

Status: **scope**. Sibling to `docs/blind-issuance-design.md` — this is that doc's
§7 **P2 "migrate existing flow"** step, now that P1 (the blind `/claim` path) is
live on testnet (chain 133).

**Decision (this scope): Stage 1 only, freshness deferred.** Stage 1 is the only
work that closes CRITICAL #2 for the credential that is actually live (group 25 /
KYC_VERIFIED). Stages 2–3 touch contracts again and are gated on the same external
audit already blocking mainnet, so they are sketched here, not detailed.

## 1. Current state (verified)

**Blind path (clean, live):** `ClaimCredential 0xA5312b448F8d85B8e25f830A696fCFF4277DfAaF`
is an approved delegate of group 25 on chain 133. `voucher_sessions` (`db.ts:117-121`)
stores only a random `session_id`; `blind-issuer.ts` only ever sees the blinded
value. No `commitment`, wallet, or applicantId is stored.

**Correlating path (`/kyc`, to be retired for KYC-Verified):**
- `POST /api/kyc/submit` (`server.ts:157`) **requires** `wallet` (`server.ts:187-190`)
  and writes `identity_commitment` next to `wallet_address` (`db.ts:34`) via
  `insertKYCRequest` (`db.ts:228-253`).
- `POST /api/kyc/sumsub/init` sets Sumsub `externalUserId = commitment` —
  `getApplicantByExternalId(body.commitment)` / `createApplicant(body.commitment,…)`
  (`server.ts:578-580`) — and writes a placeholder row carrying
  `document_type = sumsub:<applicantId>` (`server.ts:599`).
- Frontend `/kyc` (`kyc/page.tsx`) offers three credential types — `KYCVerified`,
  `AccreditedInvestor`, `HKResident` (`kyc/page.tsx:43-47`).

**Freshness is decoupled (so it is NOT in Stage 1):** `auto-freshness.ts` posts a
separate `FreshnessRegistry` leaf `Poseidon(freshnessCommitment, issuanceTime)`
keyed on its own `freshnessCommitment` (`auto-freshness.ts:1-2, 74-77`); credential
group membership is issued on `identity_commitment` independently. A KYC-Verified
credential is valid without freshness.

## 2. Goal & non-goals

**Goal:** new KYC-Verified credentials can only be obtained through the blind
`/claim` flow, and the server/Sumsub no longer learn `commitment ↔ identity` for
that credential. Remove the stored correlation for past group-25 users where we
can.

**Non-goals (Stage 1):** Accredited/HKResident groups (Stage 2); freshness on the
blind flow (separate track); removing `/api/kyc/submit` and the `kyc_requests`
columns entirely (Stage 3). Sumsub's record of *who did KYC* is inherent to using
a KYC provider and out of scope (design §2).

## 3. Stage 1 — implementation-ready

### 3.1 Frontend — make `/claim` the canonical KYC path
- `kyc/page.tsx:43-47`: remove the `KYCVerified` entry from `CREDENTIAL_TYPES`
  (leave `AccreditedInvestor`, `HKResident`). The page then serves only the groups
  that still lack a blind delegate.
- Add a redirect/banner on `/kyc` for anyone arriving expecting standard KYC,
  pointing to `/claim` (the "Private claim" route already exists, `Nav.tsx:68`).
- `Nav.tsx:65-76`: promote `/claim` to the primary "Get verified" label; relabel
  `/kyc` to something scoped (e.g. "Other credentials"). Update the `layout.tsx`
  footer "Get verified" link (currently → `/kyc`) to point at `/claim`.

### 3.2 Backend — refuse the correlating path for KYC-Verified
- `POST /api/kyc/submit` (`server.ts:157-241`): reject `credentialType === "KYCVerified"`
  with `400` ("KYC-Verified credentials are issued via the blind /claim flow").
  Leave the other credential types working.
- `POST /api/kyc/sumsub/init`: the commitment-as-`externalUserId` write
  (`server.ts:578-580`) is the Sumsub-side leak. For the KYC-Verified use case this
  route must no longer be used — the blind voucher session
  (`POST /api/kyc/voucher/session`, random `sessionId`) replaces it. Gate `init` so a
  KYC-Verified request is refused/redirected to the voucher path; other credential
  types keep using it until Stage 2.
- No new code is needed on the blind path — it already exists and is live.

### 3.3 Data — null existing group-25 correlation
- One-off backend migration: for `kyc_requests` rows with
  `credential_type = 'KYCVerified'`, null `wallet_address` and `document_type` (the
  `sumsub:<applicantId>` value). This breaks both `commitment↔wallet` and
  `commitment↔applicantId` for past users. Precedent: the email-retention nulling in
  `markKYCNotified` (`db.ts:267-273`); follow the existing `db.ts` migration pattern
  (`db.ts:55-69`).
- Keep `identity_commitment` — it is already public on-chain (it's a group member),
  so retaining it leaks nothing new and the issued credential stays auditable.
- **Honest caveat:** Sumsub still holds `externalUserId = commitment` for users who
  did KYC before this migration. That historical correlation lives in Sumsub and
  cannot be nulled from our side. Only post-migration users get full unlinkability;
  state this plainly wherever we claim CRITICAL #2 is closed.

### 3.4 Verification
- Backend route test: `/api/kyc/submit` with `credentialType:"KYCVerified"` → 400;
  other types unaffected.
- DB test: after the migration, group-25 rows have null `wallet_address` /
  `document_type`; non-KYC rows untouched.
- Manual: `/claim` still issues into group 25; no new `kyc_requests` row carries a
  real wallet for a KYC-Verified user.

## 4. Risks / caveats

- **Partial closure.** Accredited (26) / HKResident (27) still correlate via `/kyc`
  until Stage 2. CRITICAL #2 is closed only for KYC-Verified after Stage 1 — do not
  overclaim.
- **Sumsub history.** Pre-migration KYC users remain correlated inside Sumsub
  (§3.3).
- **Issuer dashboard.** It reads `wallet_address` (e.g. `server.ts:381` and the
  authenticated queue/status reads); nulling it shows blank wallets for migrated
  rows — confirm the dashboard tolerates null before running the migration.
- **Timing / funding-address linkage** on `/claim` is already mitigated by the
  privacy guidance shown at the claim step (`claim/page.tsx:285-290`); a relayer/AA
  sponsor is Stage 3 (design §6).

## 5. Stage 2 — extend blind issuance to other groups (sketch)

Deploy a `ClaimCredential` delegate per group 26/27 (and 28/29 if used) — reuse
`contracts/scripts/deploy-claim-credential.ts` with `CLAIM_GROUP_ID`. **Blocker to
resolve first:** the voucher signature is currently over the *commitment only*, not
group-bound (design §8). With one shared voucher key, a group-25 voucher could be
replayed to claim into group 26. Bind `groupId` into the signed message (contract +
`blind-issuer.ts` + `frontend/src/lib/blind.ts`), then per-type claim UI. This
re-touches `ClaimCredential.sol` → re-audit surface.

## 6. Stage 3 — full `/kyc` retirement (sketch)

Decide the fate of the local in-browser OCR method (`kyc/page.tsx:293-494`);
give the blind flow a blind-safe freshness story if recency proofs are required;
remove `/api/kyc/submit` and the correlating `kyc_requests` columns; migrate the
issuer dashboard/queue off `wallet_address`; residual-risk hardening (relayer/AA
for claim funding, issuer RSA key into HSM/KMS — design §6). Gated on the mainnet
audit.

## 7. Effort

- **Stage 1:** ~days — backend route guard + frontend rewire + one data migration +
  tests. No contract work, no audit dependency.
- **Stage 2:** ~1–2 weeks + re-audit (contract change).
- **Stage 3:** ~1–2 weeks + audit.
