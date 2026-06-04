# gated-claim

Claim a **ZK-KYC-gated airdrop** on HashKey Chain testnet in ~10 minutes. The
user proves they hold a `KYC_VERIFIED` credential without revealing any personal
data — the contract only ever sees a boolean.

Runs entirely against **live testnet contracts** (chain 133). No deployment needed.

## Prerequisites

- Node.js 18+
- A **testnet** wallet private key, funded with HSK gas from the
  [HashKey Chain testnet faucet](https://faucet-testnet.hsk.xyz). Two cheap
  transactions are enough.

## Run

```bash
cd examples/gated-claim
npm install
cp env.example .env          # then edit .env and paste your TESTNET private key
npm run claim
```

Expected output:

```
Wallet:  0x....
Identity commitment: 1234...
No KYC_VERIFIED credential found — self-issuing a demo credential...
  selfIssue tx: 0x...
Credential: KYC_VERIFIED ✓
Claiming airdrop (round 1)...
  claim tx: 0x...
Done. Airdrop balance: 1000000000000000000000
```

## What just happened

1. **Identity** — `claim.ts` derives a Semaphore identity from a wallet signature.
   It's deterministic, so the same wallet always reproduces the same identity with
   nothing to store.
2. **Credential** — on testnet the script self-issues a `KYC_VERIFIED` credential
   through the `DemoIssuer` so you can try the flow without real KYC. In
   production a user instead completes KYC at
   [`/kyc`](https://hskpassport.gudman.xyz/kyc) and a licensed issuer mints the
   credential.
3. **Proof** — `passport.generateProof(identity, groupId, scope, message)` builds
   a Groth16 proof. `scope` is the airdrop round (the nullifier namespace) and
   `message` is `BigInt(callerAddress)`, which binds the proof to the submitter
   and blocks front-running.
4. **Claim** — `KYCGatedAirdrop.claim(proof)` verifies the proof, checks the
   binding and scope, and marks the nullifier used — one claim per identity per
   round.

## Wiring it into your own contract

The on-chain gate is four lines (see
[`../../contracts/contracts/KYCGatedAirdrop.sol`](../../contracts/contracts/KYCGatedAirdrop.sol)):

```solidity
interface IHSKPassport {
    function verifyCredential(uint256 groupId, ISemaphore.SemaphoreProof calldata proof)
        external view returns (bool);
}

// inside your gated function:
if (proof.message != uint256(uint160(msg.sender))) revert ProofNotBoundToCaller();
if (proof.scope != expectedScope)                  revert WrongScope();
if (usedNullifier[proof.nullifier])                revert AlreadyClaimed();
if (!passport.verifyCredential(GROUP_ID, proof))   revert InvalidProof();
```

Use a different `GROUP_ID` to gate on a different credential type
(`ACCREDITED_INVESTOR`, `HK_RESIDENT`, …) — see the group table in the
[SDK README](../../sdk/README.md).

## Notes

- The `DemoIssuer` allows **one self-issue per wallet**. Re-running with the same
  wallet reuses the existing credential. To start clean, use a fresh wallet.
- Re-running after a successful claim prints `Already claimed in round N` — the
  nullifier is spent. Anyone can call `startNewRound(...)` on the demo airdrop to
  open a fresh round.
- This example targets testnet only. Mainnet is in safe mode (no credential
  groups) until the third-party audit completes.
