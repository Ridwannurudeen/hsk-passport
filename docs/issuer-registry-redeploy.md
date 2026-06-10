# IssuerRegistry redeploy + migration runbook

Adopting the hardened `IssuerRegistry` (PR #8) requires a **fresh deployment** —
the constructor now takes a `treasury` argument and storage/behaviour changed, so
there is no in-place upgrade (the contract is not proxied). This runbook is the
exact procedure. It is a **real-money mainnet operation**; do not run it without
reading RUNBOOK.md §9 and having the deployer key + mainnet HSK gas.

## Verified current state (chain 177, read 2026-06-10)

| Field | Value |
|---|---|
| Live registry | `0xf109cBe3D8d54D77C85ECF1367Cfcd6f075868e9` |
| `owner()` | `0x0b17f12848e1E6FDF666A87e29A346336d7450DF` (deployer EOA) |
| `slashingAuthority()` | `0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9` (Timelock — Phase-1 handoff already done) |
| `issuerCount()` | **1** — the deployer's own address, **stake = 0 HSK**, tier Community, active |
| Timelock | `0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9`, minDelay 172800s (48h) |

**Migration is trivial: there is no real staked value in the old registry** (the
single entry is a self-registration with 0 HSK). No third-party issuer funds are
at risk, so no fund migration / issuer coordination is required — this is a
deploy-and-rewire, not a stake migration.

## Pre-flight

- [ ] Contract suite green on a real toolchain: `ssh root@75.119.153.252 'cd /opt/hsk-passport/contracts && npx hardhat test'` (107 passing as of the PR #8 merge).
- [ ] Decide the **treasury address** (where slashed stake goes — immutable, set at construction). Recommended: the same multisig/Safe that will eventually own governance, NOT the deployer EOA. Export it: `export TREASURY=0x...`.
- [ ] Deployer EOA `0x0b17…50DF` holds mainnet HSK gas (`deploy-mainnet-issuer-registry.ts` prints the balance and aborts at 0).
- [ ] `contracts/.env` has the deployer `PRIVATE_KEY`.

## Step 1 — Deploy the new registry

```
cd contracts
TREASURY=0x<treasury> npx hardhat run --network hashkey-mainnet scripts/deploy-mainnet-issuer-registry.ts
```

The script prints `MAINNET_ISSUER_REGISTRY=0x<new>`. Capture it. (The script does
**not** write a deployment record yet — see Step 2.) Verify source on the
explorer once deployed.

## Step 2 — Commit the deployment record (currently missing)

The live registry has **no** committed deployment JSON (a review finding). Create
`contracts/deployments/mainnet-issuer-registry-177.json` with at least:

```json
{ "network": "chainId-177", "chainId": 177, "deployedAt": "<iso>",
  "deployer": "0x0b17f12848e1E6FDF666A87e29A346336d7450DF",
  "issuerRegistry": "0x<new>", "treasury": "0x<treasury>",
  "deployTx": "0x<tx>", "supersedes": "0xf109cBe3D8d54D77C85ECF1367Cfcd6f075868e9" }
```

(Recommended follow-up: have `deploy-mainnet-issuer-registry.ts` write this file
automatically, as the other mainnet deploy scripts do.)

## Step 3 — Re-point slashingAuthority → Timelock (Phase 1)

`handoff-mainnet-issuer-registry.ts` **hardcodes the OLD address at line 29** —
update it to `0x<new>` first. Then:

```
HANDOFF_PHASE=slashing npx hardhat run --network hashkey-mainnet scripts/handoff-mainnet-issuer-registry.ts
```

This sets `slashingAuthority = timelock` on the new registry. Owner stays the
deployer EOA (recoverable). **Do NOT run `HANDOFF_PHASE=ownership` yet** — see the
governance gate below.

## Step 4 — Set the reputation reporter (new in PR #8)

`reportIssuance`/`reportRevocation` are now restricted to `reporter` (defaults to
the deployer). If/when the backend posts reputation, set it to the backend
reporter address:

```
# owner-only call, e.g. via cast or a one-off script:
registry.setReporter(0x<backend-reporter>)
```

If reputation stays unwired, leave it as the deployer (no action).

## Step 5 — Re-register the issuer (optional)

The old self-registration had 0 stake, so nothing carries over. If a live issuer
is wanted, call `stakeAndRegister(metadataURI)` with the intended stake on the new
contract. Otherwise skip.

## Step 6 — Rewire every reference to the new address

These **12 files hardcode `0xf109…`** — update all, then rebuild/redeploy:

- `sdk/src/addresses.ts` (then `npm run build` to regenerate `sdk/dist/*`)
- `frontend/src/app/developers/page.tsx`, `frontend/src/lib/contracts.ts`
- `backend/src/config.ts`
- `contracts/scripts/handoff-mainnet-issuer-registry.ts` (already done in Step 3), `schedule-timelock-test.ts`, `check-mainnet-preflight.ts`
- `RUNBOOK.md` §2 address table
- add `deployments/mainnet-issuer-registry-177.json` (Step 2)

Then ship: `./scripts/deploy.sh` (backend + frontend) and publish the SDK bump if
the address is part of a release. Leave `deployments/mainnet-timelock-test-177.json`
(historical record of a past test).

## Step 7 — Decommission the old registry

It holds 0 value, so it can simply be abandoned. Optionally tidy the deployer's
0-stake entry on the OLD contract: `requestUnstake()` then `withdrawStake()` after
the 7-day cooldown (recovers 0 HSK — cosmetic only). Mark `0xf109…` deprecated in
docs.

## Governance gate — do NOT skip

**Do not run Phase 2 (`HANDOFF_PHASE=ownership`, owner → Timelock) until the
Timelock's proposer is a real 3-of-5 Gnosis Safe.** The Timelock today is a 1-of-1
(deployer is sole proposer + executor, per `mainnet-timelock-177.json`), so
transferring ownership now would lock the new registry behind a one-key 48h
timelock — irreversible and not an improvement. Stand up the Safe first
(RUNBOOK.md §5), grant it `PROPOSER_ROLE`, validate with the timelock test
proposal (Phase B2/B3), then transfer ownership.

## Abort / rollback

Before Step 6, nothing user-facing points at the new contract, so aborting is
free — keep using `0xf109…`. After Step 6, rollback = revert the address changes
and redeploy. Because the old contract is untouched and holds the (zero) state,
there is no on-chain rollback to perform.
