# HSK Passport — Integration Examples

Runnable, copy-pasteable examples showing how to gate a dApp on a **zero-knowledge
KYC credential** with HSK Passport. A user proves they hold a credential without
revealing any personal data; your contract gets a boolean.

| Example | What it shows | Runs against |
| --- | --- | --- |
| [`gated-claim`](./gated-claim) | End-to-end client flow: derive identity → (self-issue a test credential) → generate a ZK proof bound to the caller → claim a KYC-gated airdrop | Live HashKey Chain **testnet** (chain 133) |

## The on-chain pattern (one `require` line)

Any contract gates a function by calling `verifyCredential` on HSK Passport and
checking three things — the proof is valid, bound to the caller, and scoped to
the action. The reference consumer contracts live in
[`../contracts/contracts`](../contracts/contracts):

- [`KYCGatedAirdrop.sol`](../contracts/contracts/KYCGatedAirdrop.sol) — one sybil-resistant claim per round
- [`KYCGatedLending.sol`](../contracts/contracts/KYCGatedLending.sol) — KYC-gated borrowing
- [`GatedRWA.sol`](../contracts/contracts/GatedRWA.sol) — transfer-gated real-world-asset token

The minimal gate, from `KYCGatedAirdrop.sol`:

```solidity
if (proof.message != uint256(uint160(msg.sender))) revert ProofNotBoundToCaller();
if (proof.scope != currentRound)                   revert WrongScope();
if (claimed[currentRound][proof.nullifier])        revert AlreadyClaimed();
if (!passport.verifyCredential(requiredGroupId, proof)) revert InvalidProof();
```

- **message** binds the proof to `msg.sender` — stops front-running.
- **scope** is a per-action namespace — its nullifier enforces one use per action.
- **nullifier** is the deterministic per-(identity, scope) tag you store to prevent reuse.

The [`gated-claim`](./gated-claim) example produces a proof that satisfies all
four checks and submits it.
