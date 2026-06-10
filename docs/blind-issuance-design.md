# Blind-signature issuance — design + phased plan (CRITICAL #2)

Status: **design proposal**, not implemented. Addresses the centralized
deanonymization risk: today the backend can link every on-chain credential to a
real-world identity.

## 1. The problem (grounded in current code)

The credential flow today (`backend/src/auto-issuer.ts`, `HSKPassport.sol`):

1. User generates a Semaphore identity locally → `commitment`.
2. KYC via Sumsub, where **`externalUserId = commitment`** (`server.ts` init) — so
   Sumsub itself holds `PII ↔ commitment`.
3. `kyc_requests` stores `identity_commitment` alongside `wallet_address`,
   `notify_email`, and `document_type = sumsub:<applicantId>` (`db.ts`).
4. On approval, the issuer EOA calls
   `issueCredential(groupId, identityCommitment)` (`onlyGroupIssuerOrDelegate`,
   `HSKPassport.sol:220`), adding the commitment to the Semaphore group.

So the **backend (its DB + the Sumsub console) is a complete dossier**: given any
public commitment seen in a ZK proof, it resolves to a legal identity. The ZK
unlinkability the protocol sells is defeated at the issuance boundary. Email
retention was added as mitigation, but the core `commitment ↔ applicant` link
remains.

## 2. Goal & threat model

**Goal:** the party that adds a commitment to the group must not be able to link
it to a Sumsub applicant / PII.

- **In scope:** break `applicant ↔ commitment` at issuance, so neither the backend
  DB nor Sumsub can map a credential to an identity.
- **Out of scope (accepted):** Sumsub still holds the PII of *who did KYC* (that's
  inherent to using a KYC provider); we only stop it being joinable to on-chain
  identity. Liveness/sybil at the KYC step is unchanged.
- **Trust assumption:** the issuer signing key is honest-but-curious — it will
  sign for genuinely-KYC'd sessions, but we don't want it (or its logs) to learn
  the commitment.

## 3. Design: blind-signed voucher + self-service claim delegate

Decouple "prove you passed KYC" from "add my commitment to the group" using a
**blind signature**, and move the on-chain add to a **delegate claim contract**
the user calls themselves.

```
            KYC (Sumsub)                     blind sign                 self-claim (user-submitted tx)
 user ──────────────────────► backend ──────────────────────► user ──────────────────────► ClaimCredential
   sessionId (random,            verifies session GREEN,        unblind →                    verify issuer sig over
   NOT commitment)               signs blind(commitment):       sig over commitment          commitment, check nullifier,
                                 sees only the blinded value                                 then issueCredential(group, commitment)
```

Step by step:

1. **KYC under an unlinkable `sessionId`.** Sumsub `externalUserId` becomes a fresh
   random `sessionId`, never the commitment. Backend ↔ Sumsub knows
   `sessionId ↔ applicant ↔ PII`, but the commitment never enters this flow.
2. **Blind signing.** After GREEN, the user blinds their commitment
   `blinded = blind(commitment, r)` and sends `blinded` + `sessionId`. The backend
   checks the session is GREEN and **un-spent** (one voucher per session), signs
   `blindSig = Sign(sk, blinded)`, and marks the session spent. The backend sees
   only `blinded` — never `commitment` or `r`.
3. **Unblind.** User computes `sig = Unblind(blindSig, r)` — a valid issuer
   signature over their real `commitment`.
4. **Self-service claim.** User (ideally from a fresh/relayed address) calls
   `ClaimCredential.claim(groupId, commitment, sig)`. The contract:
   - verifies `sig` against the issuer's public key over `commitment`,
   - checks a **claim nullifier** (`hash(sig)` or `hash(commitment)`) is unused →
     one voucher = one credential,
   - calls `HSKPassport.issueCredential(groupId, commitment)` as an **approved
     delegate** of the group issuer (`approveDelegate(groupId, ClaimCredential)`).

The issuer signed a *blinded* value and the on-chain add is *user-submitted*, so
no party links `applicant ↔ commitment`.

### Why a delegate contract (no HSKPassport change)
`issueCredential` is `onlyGroupIssuerOrDelegate` and `approveDelegate(groupId,
addr)` already exists. So `ClaimCredential` is added once as a delegate per group;
the core contract is untouched.

## 4. Blind-signature scheme choice

| Option | Blinding | On-chain verify | Verdict |
|---|---|---|---|
| **RSA blind sig (Chaum)** | simple, well-understood | `modexp` precompile (0x05): `sig^e mod N == FDH(commitment)` | **Recommended** — simplest blinding; EVM-verifiable |
| BBS+ / anonymous creds | native, ZK-friendly | pairing precompile, non-trivial | Most "correct" but heavy; revisit if going full anon-cred |
| BLS blind sig | possible on bn254 | pairing (0x08) | Non-standard blinding; more footguns |
| ECDSA | not blindable cleanly | cheap | ✗ |

**Recommendation: RSA blind signatures** with a full-domain hash, verified on-chain
via the `modexp` precompile. Mature libraries exist for the client-side
blind/unblind; on-chain verify is a bounded amount of `modexp` + hashing.

## 5. Concrete changes

**Contracts (new):** `ClaimCredential.sol` — holds issuer RSA pubkey `(N,e)`,
`mapping(uint256 => bool) usedNullifier`, `claim(groupId, commitment, sig)` that
verifies + delegates to `issueCredential`. Approve it via `approveDelegate` per
group. Tests + a testnet deploy script.

**Backend:** new `POST /api/kyc/voucher` (input: `sessionId`, `blinded`; checks
session GREEN + unspent; returns `blindSig`). Stop writing `identity_commitment`
to `kyc_requests` for the blind path; use random `sessionId` as Sumsub
`externalUserId`. Keep the issuer **signing** key (RSA) separate from the on-chain
issuer/delegate key. Retire `auto-issuer`'s commitment-based path for blind-flow
credentials.

**Frontend:** client-side blind/unblind (commitment never leaves the browser
unblinded), the voucher request, and the `claim` tx. UX: surface the privacy delay
guidance (claim later / from a fresh address).

**SDK:** optional `claimCredential()` helper for integrators using the blind flow.

## 6. Residual risks & mitigations

- **Timing correlation** (claim right after KYC links session↔claim by time):
  decouple with a recommended delay + a growing anonymity set; don't auto-claim.
- **Funding-address linkage** (claim tx paid by a wallet tied to identity): claim
  from a fresh address, or add a relayer / account-abstraction sponsor so the
  user needs no pre-funded address.
- **Issuer signing-key compromise:** can mint vouchers → forge credentials (same
  blast radius as today's issuer key). Keep it in an HSM/KMS (ties into the
  existing issuer-key hardening item).
- **One-voucher-per-session enforcement** must be atomic in the backend to prevent
  a GREEN session minting many vouchers (DB unique constraint on `sessionId`).

## 7. Phased plan

- **P0 — Spike (gate):** prototype RSA blind sign/unblind end-to-end off-chain +
  a standalone `modexp` verify in a Solidity test. Decision gate: is on-chain RSA
  verify gas acceptable on HashKey Chain? If not, fall back to BBS+/ZK.
- **P1 — Testnet:** `ClaimCredential.sol` + tests; backend voucher endpoint +
  random `sessionId`; frontend blind/claim; approve the delegate on a testnet
  group; run the full flow and confirm the DB/Sumsub hold no `commitment`.
- **P2 — Hardening:** relayer/AA for claim funding; RSA key in HSM; timing/anon-set
  guidance; migrate existing flow; security review of the blind-sig + claim path.
- **P3 — Mainnet:** ships with the audited mainnet launch (gated on the same audit
  as the contracts).

Rough effort: P0 ~days; P1 ~1–2 weeks; P2 ~1–2 weeks + review. This is a feature
track, not a patch — it should be scoped with the external audit since it changes
the trust model.

## 8. Open questions

- On-chain RSA `modexp` gas on HashKey Chain — measure in P0; it decides RSA vs
  a ZK/BBS+ route.
- Do we need per-credential-type vouchers (KYC vs Accredited) or one voucher that
  unlocks a set? (Affects the signed message format.)
- Revocation in the blind model: revoking a credential still works on-chain
  (`revokeCredential`), but the issuer can't target "this applicant's commitment"
  anymore by design — revocation must be driven by the holder presenting their
  own commitment, or by a separate revocation-token scheme. Needs its own design.
