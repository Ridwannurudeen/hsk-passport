# HSK Passport — Operations Runbook

Single source of truth for deploying, hardening, and operating HSK Passport in
the soft-mainnet → mainnet transition. Read this end-to-end before broadcasting
any mainnet transaction.

---

## 1. Environments

| Layer       | Network          | Chain ID | Notes                                           |
|-------------|------------------|----------|-------------------------------------------------|
| Credentials | HashKey testnet  | 133      | All HSKPassport / Freshness / dApps live here.  |
| Issuer staking | HashKey mainnet | 177  | IssuerRegistry only. Real HSK at risk.          |

The split is deliberate. Credentials and KYC continue to issue on testnet
pending third-party audit; the IssuerRegistry on mainnet is what makes "staked
issuers" mean something economically.

## 2. Contract addresses (current)

### Testnet (chain 133)

| Contract              | Address                                              |
|-----------------------|------------------------------------------------------|
| Semaphore             | `0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9`         |
| HSKPassport           | `0x7d2E692A08f2fb0724238396e0436106b4FbD792`         |
| HSKPassportTimelock   | `0xb07Bc78559CbDe44c047b1dC3028d13c4f863D8A`         |
| IssuerRegistry        | `0x5BbAe6e90b82c7c51EbA9cA6D844D698dE2eb504`         |
| FreshnessRegistry     | `0xd251ecAD1a863299BAD2E25B93377B736a753938`         |
| FreshnessVerifier     | `0x59A03fF053464150b066e78d22AEc2F69D081394`         |
| HSKPassportFreshness  | `0xFF790dE1537a84220cD12ef648650034D4725fBb`         |
| DemoIssuer            | `0xBf7d566B8077A098F6844fb6b827D2A4118C88C3`         |

### Mainnet (chain 177)

| Contract       | Address                                              | Status        |
|----------------|------------------------------------------------------|---------------|
| IssuerRegistry | `0xf109cBe3D8d54D77C85ECF1367Cfcd6f075868e9`         | Live          |
| Timelock       | (not yet deployed — see §5)                          | Pending       |

## 3. Backend env vars

The backend reads RPC + secrets from environment. Defaults are safe for local
development; production overrides go in the systemd unit on the VPS.

| Var                     | Default                       | Used by                |
|-------------------------|-------------------------------|------------------------|
| `RPC_URL`               | `https://testnet.hsk.xyz`     | indexer, auto-issuer   |
| `MAINNET_RPC_URL`       | `https://mainnet.hsk.xyz`     | issuers.ts, healthz    |
| `PORT`                  | `4021`                        | server                 |
| `DB_PATH`               | `./hsk-passport.db`           | sqlite location        |
| `DEPLOY_BLOCK`          | `26400000`                    | indexer cold-start     |
| `ALLOWED_ORIGINS`       | site + localhost              | CORS                   |
| `ISSUER_PRIVATE_KEY`    | (unset → auto-issuance off)   | auto-issuer, auto-freshness |
| `DEMO_AUTO_APPROVE`     | `false`                       | auto-issuer demo mode  |
| `AUTO_FRESHNESS_DISABLE`| `false`                       | kill-switch for §6     |
| `SUMSUB_*`              | (per Sumsub account)          | Sumsub integration     |
| `EMAIL_*`               | (SMTP config)                 | notifications          |

## 4. Monitoring & health

### Endpoints

- `GET /api/healthz` — JSON report. Always parseable; degraded states return
  the report with `status: "warn" | "error"` and HTTP 200.
- `GET /api/metrics` — Prometheus text format. Scrape every 30–60s.
- `GET /api/registry/governance` — IssuerRegistry owner / slashing authority,
  whether each is the timelock, current min-delay. Drives the issuers-page banner.

### Health classification (in `backend/src/health.ts`)

| Status | Conditions                                                  |
|--------|-------------------------------------------------------------|
| `ok`   | Indexer ≤ 5 blocks behind AND last sync ≤ 60s ago AND no error. |
| `warn` | Indexer ≤ 50 blocks behind AND last sync ≤ 5min ago AND no error. |
| `error`| Worse than the above, or indexer reported an error, or an RPC down. |

### Frontend signal

The footer `HealthIndicator` polls `/api/healthz` every 30s. Green dot = ok,
amber = warn, red = error. Hover for details.

### Prometheus metrics emitted

`hsk_passport_uptime_seconds`, `hsk_passport_health_status` (0/1/2),
`hsk_passport_indexer_lag_blocks`, `hsk_passport_indexer_last_block`,
`hsk_passport_indexer_seconds_since_sync`, `hsk_passport_indexer_last_error`,
`hsk_passport_rpc_{testnet,mainnet}_up`, `hsk_passport_rpc_{testnet,mainnet}_latency_ms`,
`hsk_passport_kyc_pending`, `hsk_passport_active_credentials_total`,
`hsk_passport_active_credentials{group_id="…"}`.

## 5. Mainnet governance handoff (1-of-1 timelock)

Two-phase rollout. Both phases require the IssuerRegistry-deployer key (the EOA
that owns mainnet IssuerRegistry today) and mainnet HSK gas.

### Phase A — deploy timelock

```
PRIVATE_KEY=… npx hardhat run \
  --network hashkey-mainnet \
  scripts/deploy-mainnet-timelock.ts
```

Records `contracts/deployments/mainnet-timelock-177.json` with the timelock
address. Constructor params: `proposers=[deployer]`, `executors=[deployer]`,
`admin=address(0)`, `minDelay=48h`.

### Phase B1 — transfer slashingAuthority (recoverable)

```
HANDOFF_PHASE=slashing PRIVATE_KEY=… npx hardhat run \
  --network hashkey-mainnet \
  scripts/handoff-mainnet-issuer-registry.ts
```

After this, slashings require a 48h scheduled call. Owner is still the deployer
EOA so we can roll back via `setSlashingAuthority(deployer)` if the timelock is
misconfigured.

### Phase B2 — transfer ownership (IRREVERSIBLE)

Only run after Phase B1 has been live for at least one verified test proposal
(schedule any owner-only call via the timelock, wait 48h, execute, confirm
nothing reverted).

```
HANDOFF_PHASE=ownership PRIVATE_KEY=… npx hardhat run \
  --network hashkey-mainnet \
  scripts/handoff-mainnet-issuer-registry.ts
```

After this every owner action — including `transferOwnership` itself — must go
through the 48h timelock. If the timelock contract has a bug, the registry is
permanently stuck. This is the trade-off for credibly removing the unilateral
key.

### After handoff

The frontend issuers-page banner self-updates from `/api/registry/governance`.
Once both `ownerIsTimelock` and `slashingIsTimelock` are true, the banner
flips green: "Governance: 48h timelock."

## 6. v6 freshness auto-issuer

### One-time setup (testnet)

The auto-freshness loop posts leaves to `FreshnessRegistry.addLeaf`. The issuer
EOA must be authorised on the registry per credential group. One-time:

```
ISSUER_EOA=0x... PRIVATE_KEY=<freshness-deployer-key> \
  npx hardhat run --network hashkey-testnet \
  scripts/authorize-freshness-issuer.ts
```

`PRIVATE_KEY` here is the FreshnessRegistry deployer (= owner). `ISSUER_EOA` is
the address derived from `ISSUER_PRIVATE_KEY` on the backend.

### How it works

When a KYC request reaches `status='approved'` in the backend DB AND has a
`freshness_commitment`, the loop:

1. Reads the row.
2. Computes `leaf = Poseidon(freshness_commitment, reviewed_at_seconds)`.
3. Appends it to its in-memory mirror of the on-chain Merkle tree, recomputes
   the root (depth 16, Poseidon, matches `circuits/src/credential_freshness.circom`).
4. Calls `addLeaf(groupId, leaf, newRoot)` on the registry.
5. On confirmation, persists the leaf to `freshness_leaves` so we never repost.

On startup the loop rebuilds in-memory state from `freshness_leaves` and
reconciles its computed root against `registry.currentRoot(groupId)`. If they
disagree, the loop refuses to post for that group — prevents corrupting an
otherwise-valid tree if the DB drifted.

### Disabling

Set `AUTO_FRESHNESS_DISABLE=true` in the backend env and restart. Existing
`freshness_leaves` rows stay; the loop just stops appending.

### Per-user lookup

`GET /api/freshness/identity/:freshnessCommitment` returns the user's leaf
index, issuance time, and tree root after their leaf was inserted. Used by
`/demo/fresh` to drive the "Your credential" mode.

## 7. AnonymitySetGate

Opt-in contract. dApps that want to enforce a minimum anonymity-set size call
through it instead of HSKPassport / HSKPassportFreshness directly:

- `gate.verifyCredentialWithFloor(passport, groupId, proof, minMembers)` —
  reverts `AnonymitySetTooSmall` below floor; emits `LowAnonymitySet` when size
  in `[floor, 10000)`.
- `gate.verifyCredentialWithExpiryAndFloor(...)` — same plus expiry check.
- `gate.verifyFreshWithFloor(...)` — same shape against the freshness composer
  and registry leaf count.
- `gate.inspect / inspectFreshness` — pure-view variants for UI hints.

Defaults: warn at 10K members, hard floor at 1K when `minMembers = 0`.

Deploy:

```
npx hardhat run --network hashkey-testnet scripts/deploy-anonymity-gate.ts
npx hardhat run --network hashkey-mainnet scripts/deploy-anonymity-gate.ts
```

The gate is owner-less and stateless — same script works on both networks.

## 8. Standard ops procedures

### Restarting the backend

```
ssh root@<vps>
systemctl restart hsk-passport-backend
journalctl -u hsk-passport-backend -f
```

Watch for: `[indexer] started`, `[auto-freshness] started`, no scary errors in
the first 10s. Hit `/api/healthz` — should return `status: "ok"` within 30s.

### Indexer fell behind

Check `/api/healthz`. If `indexer.lastError` is set, the upstream RPC threw and
the loop will retry next tick. If `secondsSinceSync` keeps growing past 5min,
either RPC is genuinely down or the indexer is stuck. Logs first; do NOT
manually edit `sync_state.last_block` unless you're certain.

### Auto-issuer never fires

Check `ISSUER_PRIVATE_KEY` is set and `DEMO_AUTO_APPROVE=true` for the demo
mode. For production issuance the auto-issuer wallet must be approved as an
HSKPassport issuer on-chain.

### Auto-freshness never fires

1. `ISSUER_PRIVATE_KEY` set.
2. `AUTO_FRESHNESS_DISABLE` not set to `true`.
3. Issuer EOA authorised on `FreshnessRegistry` for the relevant group (§6
   one-time setup). Backend logs `authorised=true` per group at startup.
4. KYC requests have `freshness_commitment` populated. Check via `sqlite3
   hsk-passport.db "SELECT id, status, freshness_commitment IS NOT NULL FROM
   kyc_requests ORDER BY submitted_at DESC LIMIT 5"`.

### Root mismatch on auto-freshness boot

`[auto-freshness] ROOT MISMATCH group N: local=… on-chain=…`

The DB's leaves don't reproduce the on-chain currentRoot. Causes: another
writer (e.g. a manual `addLeaf` from the deploy script) inserted a leaf the
backend doesn't know about. The loop self-disables for that group until
resolved. Resolution: reconcile `freshness_leaves` against the on-chain log
(`LeafAdded` events on FreshnessRegistry) before re-enabling.

## 9. Pre-deploy checklist

Before broadcasting any mainnet transaction:

- [ ] `npx hardhat test` is 100% green.
- [ ] Backend `npm run build` is clean.
- [ ] Frontend `npm run build` is clean.
- [ ] Mainnet wallet has sufficient HSK for the planned operation.
- [ ] You have read the relevant section of this runbook in full.
- [ ] You can describe what happens if the transaction reverts.
- [ ] User has explicitly approved the broadcast.
