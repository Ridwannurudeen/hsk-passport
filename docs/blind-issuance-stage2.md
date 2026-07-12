# Blind-issuance Stage 2 — unlinkable issuance for all credential groups

Status: **scope** (detailed). Builds on Stage 1 (KYC-Verified / group 25 now issues
only through the blind `/claim` delegate). Goal: bring Accredited Investor (26) and
HK Resident (27) onto the same unlinkable flow and retire the correlating `/kyc`
path for them.

## 1. The problem to solve — cross-group replay (verified)

`ClaimCredential.messageRep` hashes the **commitment only** —
`sha256(abi.encodePacked(commitment))` expanded via MGF1 (`ClaimCredential.sol:76-77`)
— and `claim()` adds the commitment to the contract's **immutable `groupId`**
(`ClaimCredential.sol:62`). So if two `ClaimCredential` instances (say group 25 and
group 26) are pinned to the **same** voucher key `(N, e)`, a signature valid at the
group-25 instance (`sig^e mod N == FDH(commitment)`) is **equally valid** at the
group-26 instance. One voucher could be redeemed into any group. This must be
prevented before a second delegate is deployed.

## 2. Approach — per-group voucher keys (recommended)

| Option | Mechanism | Contract change | Verdict |
|---|---|---|---|
| **A. Per-group RSA key** | Deploy `ClaimCredential[g]` pinned to a distinct `(N_g, e_g)`; backend signs group-`g` vouchers with `key_g`. A `key_25` signature fails `verify` at the group-26 instance (different modulus). | **None** — reuses the existing contract bytecode unchanged, just new instances + keys. | **Recommended** — resolves replay with zero contract-logic change and the smallest audit surface. Matches design §8 "per-credential-type voucher." |
| B. Bind groupId into the hash | `messageRep(commitment, groupId)`; one shared key. | Changes the contract's FDH construction **and** `blind-issuer.ts` + `frontend/src/lib/blind.ts` in lockstep. | Rejected for now — new hand-rolled crypto to re-audit, for no functional gain over A. |

## 3. Verified constraints

- **Single Sumsub level.** `SUMSUB_LEVEL_NAME` (default `hsk-passport-basic-kyc`,
  `sumsub.ts:11-12`) is used for every applicant and access token. So *today*
  Accredited/HKResident credentials are already backed only by basic-KYC GREEN — the
  credential **type is user-selected metadata, not separately verified**. Stage 2
  **preserves** this semantic (same basic-KYC gate, now unlinkable). Real
  accreditation/residency verification would require dedicated Sumsub levels — a
  **pre-existing** product gap, neither introduced nor blocked by Stage 2.
- **`voucher_sessions` has no group column** (`db.ts:117-121`: `session_id`,
  `created_at`, `spent_at`) — Stage 2 adds `group_id`.
- **`blind-issuer.ts` is single-key** (one cached `VoucherKey`, `getVoucherKey`) —
  refactor to select a key by group.
- **Frontend `/claim` + `CLAIM_CREDENTIAL` are single-group** (`contracts.ts`) — add
  per-group delegate addresses + a credential-type selector.

## 4. Implementation increments

1. **Keys + contracts (testnet broadcasts — gated).** Generate a distinct voucher
   keypair per group (Stage-1 pattern; private PEMs outside the repo, e.g.
   `/etc/hsk-passport/voucher_rsa_priv_g26.pem`, `…_g27.pem`, chmod 600). Deploy
   `ClaimCredential` per group with `contracts/scripts/deploy-claim-credential.ts`
   `CLAIM_GROUP_ID=26` / `=27` (the script reads each group's issuer live and
   auto-`approveDelegate`s iff deployer == issuer, else prints the call). Record
   `contracts/deployments/claim-credential-133.json` per group.
2. **Backend multi-key + group-aware voucher.** Key `blind-issuer.ts` by group
   (`VOUCHER_RSA_PRIVATE_KEY_FILE_G26` / `_G27`, or a `{groupId → keyFile}` map).
   `POST /api/kyc/voucher/session` and `POST /api/kyc/voucher` accept a `groupId`;
   add `voucher_sessions.group_id`; sign with `key[groupId]`. One-voucher-per-session
   stays atomic. `tsc` + runtime curl on the VPS.
3. **Frontend.** Add `CLAIM_CREDENTIAL` per group (25/26/27, same ABI); `/claim`
   lets the user pick the credential type and runs the same blind → voucher →
   unblind → `claim()` against the matching delegate.
4. **Migrate + retire.** Reject `AccreditedInvestor`/`HKResident` in
   `/api/kyc/submit`; remove them from `/kyc` (now empty → retire or repurpose the
   page); extend the Stage-1 redaction script to credential types 26/27. Removing
   `/api/kyc/submit` + the old `sumsub/init`/`webhook` path entirely overlaps Stage 3.

## 5. Risks

- Each per-group `ClaimCredential` deploy is a testnet broadcast; **mainnet stays
  audit-gated** (hand-rolled RSA-FDH, `ClaimCredential.sol:19-25`).
- Multi-key adds config surface — one PEM + one systemd `Environment=` per group;
  keep every key outside the repo (Stage-1 precedent).
- Retiring `/kyc` removes the local-OCR verification method and the freshness
  registration it performs — coordinate with the Stage 3 decisions on both.

## 6. Effort

~1–2 weeks including the per-group re-deploys and per-type frontend. **No new
contract crypto** under approach A, so no fresh crypto-audit item beyond the
existing RSA-FDH review already pending for Stage 1's delegate.
