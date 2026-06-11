# ClaimCredential deploy + voucher enablement runbook (testnet)

Bring the blind-issuance flow (CRITICAL #2) live on `hashkey-testnet`. This deploys
one new `ClaimCredential` delegate, pins it to the issuer RSA voucher key, enables
the backend voucher endpoints, and wires the frontend `/claim` page.

**Additive only** — deploys one contract and (at most) sets one delegate flag on the
live `HSKPassport`. Nothing existing is modified; the current credential flow keeps
working unchanged.

**Audit-lane gate:** the hand-rolled RSA-FDH blind signature (`ClaimCredential.sol`,
`backend/src/blind-issuer.ts`, `frontend/src/lib/blind.ts`) has **not** had external
cryptographic review. Run this on **testnet only** until that review is done. Do not
promote to mainnet (chain 177) before the audit.

## Verified state (read 2026-06-11)

| Field | Value |
|---|---|
| VPS | `root@75.119.153.252`, repo at `/opt/hsk-passport` (contracts deps installed — `hardhat test` runs there) |
| Deploy network | `hashkey-testnet` — chainId **133**, RPC `https://testnet.hsk.xyz` (`contracts/hardhat.config.ts:20-23`) |
| Deployer key | `contracts/.env` → `PRIVATE_KEY` (must match `^0x[a-fA-F0-9]{64}$`, else no signer; `hardhat.config.ts:5-7`) |
| HSKPassport (testnet) | `0x7d2E692A08f2fb0724238396e0436106b4FbD792` — auto-resolved from `sdk/src/addresses.ts:22`; no env needed |
| Claim group | `CLAIM_GROUP_ID` default **25** (KYC_VERIFIED) — `deploy-claim-credential.ts` |
| Group-25 issuer | read live by the deploy script; auto-`approveDelegate` **iff** deployer == issuer, else it prints the exact call |
| `CLAIM_CREDENTIAL.address` | placeholder `0x0000…0000` at `frontend/src/lib/contracts.ts:198` — set in step 4 |
| Backend voucher gate | `voucherConfig.configured = Boolean(VOUCHER_RSA_PRIVATE_KEY)` (`blind-issuer.ts:91-94`) — **absent ⇒ endpoints return `{enabled:false}`, no boot break** |

## Pre-flight

- [ ] Contract suite green on the VPS: `ssh root@75.119.153.252 'cd /opt/hsk-passport/contracts && npx hardhat test'`.
- [ ] VPS at `origin/master` tip (`dad0483` after the #15 merge): `ssh root@75.119.153.252 'cd /opt/hsk-passport && git fetch origin master && git reset --hard origin/master'` — or just run `./scripts/deploy.sh` once.
- [ ] Deployer EOA in `contracts/.env` holds testnet HSK gas (faucet). The script prints the balance before deploying.
- [ ] Confirm whether the deployer EOA **is** the group-25 issuer. If yes → the script approves the delegate in the same run. If no → you need the issuer key for step 3b.

## Step 1 — Generate the voucher keypair (once, secure host)

Run in a secure environment; the private key is a signing secret (stdout only — it
writes nothing to disk and commits nothing):

```
node scripts/gen-voucher-key.mjs
```

Capture three outputs: the **PKCS#8 private PEM** (`VOUCHER_RSA_PRIVATE_KEY`, backend
secret), the **SPKI public PEM** (`VOUCHER_RSA_PUBLIC_KEY`, safe for the deploy env),
and the printed on-chain `(modulus, exponent)`. The deploy script derives the same
`(N,e)` bytes from whichever PEM you give it — derivation is byte-for-byte identical
to `backend/src/blind-issuer.ts` (`NLEN=256`, `b64uToBig`, `toBytesBE`/`padStart`).

> If a voucher key already exists in production (`backend/.env`), **reuse it** — skip
> generation and feed that same key to step 2 via `VOUCHER_RSA_PUBLIC_KEY`. The
> on-chain key and the backend signing key MUST be the same RSA key.

## Step 2 — Deploy ClaimCredential + approve delegate

On the VPS (or any Linux host with the deployer key and RPC reach):

```
cd /opt/hsk-passport/contracts
export VOUCHER_RSA_PUBLIC_KEY="$(cat /path/to/voucher_pub.pem)"   # or VOUCHER_RSA_PRIVATE_KEY
npx hardhat run scripts/deploy-claim-credential.ts --network hashkey-testnet
```

The script: prints deployer/network/balance/group, derives `(N,e)`, deploys
`ClaimCredential(passport, 25, modulus, exponent)`, reads the group-25 issuer, and:
- **deployer == issuer** → calls `approveDelegate(25, claimAddr)` and prints the tx hash;
- **deployer != issuer** → prints `passport.approveDelegate(25, "<claimAddr>")` for the issuer to run (step 3b).

It writes `contracts/deployments/claim-credential-133.json` and prints the deployed
`ClaimCredential` address. **Capture that address** (`claimAddr`).

## Step 3 — Configure the backend voucher key

`backend/.env` is preserved across deploys (`.gitignore`d), so set it directly on the VPS:

```
ssh root@75.119.153.252
printf 'VOUCHER_RSA_PRIVATE_KEY="%s"\n' "$(cat /path/to/voucher_priv.pem)" >> /opt/hsk-passport/backend/.env
systemctl restart hsk-passport-api
```

The PEM must be the private half of the **same** key pinned in step 2. Multi-line PEM
in `.env`: keep it quoted, or store the PEM path and load it — match however other
multi-line secrets are already set in that file (check before appending).

### Step 3b — Issuer approves the delegate (only if deployer ≠ issuer)

The group-25 issuer signs:

```
passport.approveDelegate(25, "<claimAddr>")
```

`approveDelegate` is `onlyGroupIssuer` — no one else can grant it. Until this lands,
`claim()` will revert for an un-approved delegate.

## Step 4 — Wire the frontend (goes through git, not a hand-edit on the VPS)

The VPS mirrors `origin/master` and **discards local drift** on every deploy
(`scripts/deploy.sh` does `git reset --hard origin/master`), so the address must be
committed:

1. Edit `frontend/src/lib/contracts.ts:198` → `address: "<claimAddr>"`.
2. Commit on a branch, push, open PR → merge to `master`.
3. `./scripts/deploy.sh` (or `--skip-backend` for frontend-only).

## Step 5 — Runtime verification (on the VPS, Linux)

```
# voucher endpoints enabled?
curl -s https://hskpassport.gudman.xyz/api/kyc/voucher/pubkey        # expect the pubkey, NOT {enabled:false}
curl -s -X POST https://hskpassport.gudman.xyz/api/kyc/voucher/session  # expect a random sessionId + Sumsub applicant
```

Then drive the full client flow at `/claim`: blind the commitment → `POST /api/kyc/voucher`
(GREEN-gated, one voucher per session) → unblind → submit `claim()` on-chain. Confirm:
a real credential is issued, a tampered signature reverts, and a replayed nullifier is
blocked (these are the #13 contract test cases, now end-to-end).

## Notes / known limits

- `{enabled:false}` from `/api/kyc/voucher/pubkey` means `VOUCHER_RSA_PRIVATE_KEY`
  isn't set or didn't load — re-check step 3, then restart `hsk-passport-api`.
- The voucher signature is over the **commitment only**, not group-bound (design §8) —
  fine for the single KYC delegate; revisit if a second delegate group is added.
- This enables the blind path but does **not** remove the existing correlating
  `/api/kyc/submit` route (stores `wallet_address`). Fully closing CRITICAL #2 means
  migrating users onto `/claim` and retiring the correlating path — a follow-up.
