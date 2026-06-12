# Gnosis Safe governance setup (mainnet)

Stand up the 3-of-5 Gnosis Safe that becomes the real proposer of the mainnet
`HSKPassportTimelock`, replacing today's 1-of-1 (deployer-only) posture. This is the
**critical-path blocker** for the IssuerRegistry ownership handoff (RUNBOOK §5 Phase B4)
and for the registry redeploy's treasury (`docs/issuer-registry-redeploy.md`): both
should point at this Safe.

It is a **real-money mainnet operation** (timelock self-calls broadcast on chain 177)
and needs the deployer key + 5 independent signers. Read RUNBOOK.md §9 before broadcasting.

## Verified facts

| Field | Value | Source |
|---|---|---|
| Safe is live on HashKey **mainnet** | yes (production + testnet) | [HashKey Docs — Safe](https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/Safe) |
| Safe web app | `https://multisig.hashkeychain.net/welcome?chain=HSK` | ″ |
| Safe Transaction Service | `https://safe-transaction-hashkey.safe.global` | ″ |
| Timelock | `0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9`, minDelay **172800s (48h)** | RUNBOOK §2, `mainnet-timelock-177.json` |
| Timelock admin | `address(0)` — **self-administered**; role changes go through a 48h timelock self-call | `deploy-mainnet-timelock.ts:41`, OZ v5 `TimelockController` |
| Current proposer/executor | deployer EOA `0x0b17…50DF` (sole) | `deploy-mainnet-timelock.ts:39-40` |
| Role model | OZ v5 grants **PROPOSER_ROLE + CANCELLER_ROLE** to every proposer | `TimelockController.sol:126-127` |

Because admin is `address(0)`, you cannot `grantRole` with an EOA. The deployer (current
proposer) schedules a timelock self-call that grants the roles to the Safe; after 48h
anyone executes it. That is exactly what `scripts/grant-timelock-proposer.ts` does.

## Step 0 — Signers & threshold (off-chain, your decision)

- [ ] Collect **5 independent signer addresses** on HashKey mainnet (distinct people/keys/devices — independence is the whole point).
- [ ] Confirm **threshold = 3-of-5**.
- [ ] Each signer holds a little mainnet HSK for gas when co-signing.

## Step 1 — Create the Safe

1. Each signer connects at `https://multisig.hashkeychain.net/welcome?chain=HSK`.
2. Create a new Safe with the 5 owners and threshold 3.
3. **Record the Safe address** — call it `SAFE`. This same address is the
   `TREASURY` for the IssuerRegistry redeploy and the future owner of governance.

## Step 2 — Schedule the role grant (deployer, broadcasts 1 tx)

```
cd contracts
GRANT_PHASE=schedule SAFE_ADDRESS=0x<SAFE> \
  npx hardhat run --network hashkey-mainnet scripts/grant-timelock-proposer.ts
```

Schedules a batch granting `PROPOSER_ROLE + CANCELLER_ROLE` to the Safe and writes
`deployments/mainnet-grant-proposer-177.json` (salt + operation hash for Step 4).
The script aborts if the deployer isn't a proposer or the Safe already holds the role.

## Step 3 — Wait 48h

The timelock will not let the grant execute before `minDelay` (172800s) elapses.

## Step 4 — Execute the grant (anyone, after 48h)

```
GRANT_PHASE=execute \
  npx hardhat run --network hashkey-mainnet scripts/grant-timelock-proposer.ts
```

Post-check (in-script): asserts the Safe now holds **both** roles. If either is false,
the script throws — stop and investigate.

## Step 5 — Validate the Safe actually controls the timelock

Before trusting it, prove the Safe can drive the timelock end-to-end:
- From the Safe app, build a transaction calling `timelock.schedule(...)` for a
  harmless op (e.g. the Phase B2 test: `IssuerRegistry.slash(deployer, 0, "safe-test")`),
  collect 3-of-5 signatures, submit.
- Wait 48h, then `execute`. If the scheduled op runs and the expected event fires, the
  Safe is a working proposer. (This mirrors RUNBOOK §5 Phase B2/B3, but proposed *by the
  Safe* rather than the deployer.)

## Step 6 — Revoke the deployer's proposer powers

Only after Step 5 succeeds. Now that the Safe is a proposer, have **the Safe** schedule a
batch through the timelock that calls `revokeRole(PROPOSER_ROLE, deployer)` and
`revokeRole(CANCELLER_ROLE, deployer)`, wait 48h, execute. This removes the unilateral
key so proposals require 3-of-5. Do **not** revoke before the Safe is proven, or you lose
the ability to propose anything.

## What this unblocks

Once the Safe is the timelock's proposer:
1. **IssuerRegistry redeploy** can proceed with `TREASURY=0x<SAFE>` (immutable treasury =
   the multisig) — `docs/issuer-registry-redeploy.md`.
2. **Ownership handoff** (RUNBOOK §5 Phase B4, `HANDOFF_PHASE=ownership`) becomes safe to
   run: ownership moves to a timelock that is genuinely 3-of-5-controlled, not one key.

## Abort / rollback

Steps 0-1 are off-chain (free to abandon). The Step 2 grant is additive — until Step 6
revokes the deployer, the deployer remains a proposer, so a misconfigured Safe grant is
recoverable (the deployer can schedule a `revokeRole` on the Safe). After Step 6, the
Safe is the sole proposer; rolling back then requires a 3-of-5 Safe action.
