# Per-type Sumsub verification levels

Status: **scope**. Prerequisite for Stage 2 (and a fix for the existing `/kyc`
path). Today every credential type is verified by **one** basic-KYC Sumsub level,
so the credential *type* is unverified, user-selected metadata. This scopes giving
Accredited Investor (group 26) and HK Resident (group 27) their own Sumsub
verification, so a credential attests what it claims — which must exist **before**
Stage 2 makes those credentials unlinkable (an unlinkable "Accredited" credential
that only proves basic KYC would be worse than the linkable status quo).

## 1. Current state (verified)

- A single level constant: `SUMSUB_LEVEL_NAME` (`sumsub.ts:11-12`, default
  `hsk-passport-basic-kyc`).
- Used by `createApplicant` (`sumsub.ts:117`) and `generateAccessToken`
  (`sumsub.ts:161`); exposed to the frontend via `sumsubConfig.levelName`
  (`server.ts:533, 625, 832`).
- Applicant lookups (`getApplicantByExternalId` / `getApplicantById`) are
  level-agnostic.
- **Result:** an Accredited or HK Resident applicant runs the *same* basic-KYC flow;
  the type is only a label on the resulting credential request.

## 2. Two parts

### Part A — define + configure the levels (EXTERNAL / product — the real work)

The verification logic lives in the **Sumsub dashboard**, not in this repo. Per
type, someone must decide the criteria and build the level:

- **KYC Verified (25):** existing basic KYC (identity document + liveness). No change.
- **Accredited Investor (26):** decide what proves accreditation — e.g. proof of
  income / net-worth statement, a Sumsub questionnaire step, or a manual review —
  then build a level (e.g. `hsk-passport-accredited`).
- **HK Resident (27):** proof of HK residency (e.g. proof-of-address document); build
  a level (e.g. `hsk-passport-hk-resident`).

These are product + compliance decisions plus Sumsub-console configuration. **They
cannot be done from the codebase**, and nothing downstream is correct until the
levels exist.

### Part B — code: select the level by credential type (small, mechanical)

- **config:** replace the single `SUMSUB_LEVEL_NAME` with a per-type map
  (`SUMSUB_LEVEL_KYC` / `SUMSUB_LEVEL_ACCREDITED` / `SUMSUB_LEVEL_HKRESIDENT`) and a
  `levelFor(credentialType)` resolver that defaults to the KYC level for unknown
  types.
- **`sumsub.ts`:** give `createApplicant(externalUserId, levelName, country?)` and
  `generateAccessToken(externalUserId, levelName, ttl?)` an explicit level parameter
  instead of reading the module constant; expose the map/resolver on `sumsubConfig`.
- **`server.ts`:** flow `credentialType` into the applicant/token-creating endpoints
  and resolve the level:
  - `/api/kyc/sumsub/init` — accept `credentialType`, resolve its level (today it is
    effectively KYC-only).
  - The `/kyc` Sumsub method already sends `credentialType` to `/api/kyc/submit`; the
    init call must carry it too so the SDK opens the right level.
  - *(Stage 2)* `/api/kyc/voucher/session` — carries the target group/type → level.
- **frontend:** pass `credentialType` to `apiSumsubInit`; render the level returned
  for that type.

## 3. Sequencing

Part B is ~half a day of mechanical wiring. **Part A is the gating, external
product/compliance work** — define the criteria and stand up the Sumsub levels
first; Part B then wires them; Stage 2 follows. Until the levels exist, Part B has
nothing meaningful to point at.

## 4. Note

This is not solely a Stage 2 prerequisite — it also fixes the **existing** `/kyc`
path, where Accredited/HKResident credentials are currently backed only by basic
KYC.
