# gated-rwa

Mint a **ZK-KYC-gated ERC-20** (`hSILVER`) on HashKey Chain testnet in ~10 minutes.
The user proves they hold a `KYC_VERIFIED` credential without revealing any
personal data; the token contract only ever sees a boolean.

Runs entirely against **live testnet contracts** (chain 133). No deployment needed.

This is the sibling of [`gated-claim`](../gated-claim) and shows a different gate
shape: `GatedRWA` verifies the proof **directly against the Semaphore contract**
(no action rounds), binding it to the caller and tracking a per-mint nullifier.

## Prerequisites

- Node.js 18+
- A **testnet** wallet private key, funded with HSK gas from the
  [HashKey Chain testnet faucet](https://faucet-testnet.hsk.xyz).

## Run

```bash
cd examples/gated-rwa
npm install
cp env.example .env          # then edit .env and paste your TESTNET private key
npm run mint
```

Expected output:

```
Wallet:  0x....
Identity commitment: 1234...
No KYC_VERIFIED credential found — self-issuing a demo credential...
  selfIssue tx: 0x...
Credential: KYC_VERIFIED ✓
Minting 100000000000000000000 hSILVER...
  kycMint tx: 0x...
Done. hSILVER balance: 100000000000000000000
```

## The gate

From [`../../contracts/contracts/GatedRWA.sol`](../../contracts/contracts/GatedRWA.sol):

```solidity
function kycMint(ISemaphore.SemaphoreProof calldata proof) external {
    if (proof.message != uint256(uint160(msg.sender))) revert ProofNotBoundToCaller();
    if (usedNullifiers[proof.nullifier])               revert NullifierAlreadyUsed();
    if (!semaphore.verifyProof(requiredGroupId, proof)) revert InvalidProof();
    usedNullifiers[proof.nullifier] = true;
    // ...mint
}
```

- **message** binds the proof to `msg.sender` — stops front-running.
- **nullifier** (deterministic per identity + scope) is stored so each identity
  mints once. Re-running prints `already minted`.
- Unlike [`gated-claim`](../gated-claim), there's no per-round scope — any caller
  with a valid `KYC_VERIFIED` credential can mint exactly once.

## Notes

- The `DemoIssuer` allows **one self-issue per wallet**. To start clean, use a
  fresh wallet.
- This example targets testnet only. Mainnet is in safe mode (no credential
  groups) until the third-party audit completes.
- For the full integration walkthrough and the four-line gate pattern, see the
  [examples index](../README.md).
