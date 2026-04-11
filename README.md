# HSK Passport

**Privacy-preserving KYC credentials for HashKey Chain.**

Built for the [HashKey Chain Horizon Hackathon 2026](https://dorahacks.io/hackathon/2045) — ZKID Track.

## What is HSK Passport?

HSK Passport enables zero-knowledge credential verification on HashKey Chain. Users prove they hold a KYC credential without revealing any personal information.

- **Issuers** (e.g., HashKey Exchange) verify users off-chain and add their cryptographic identity to credential groups on-chain
- **Users** generate Groth16 zero-knowledge proofs in their browser proving group membership
- **dApps** call `verifyCredential()` — get a boolean, see zero personal data

## Architecture

```
  Issuer (KYC Provider)          HSK Passport Contract          dApp (RWA, DeFi, etc.)
  ┌───────────────────┐         ┌──────────────────────┐        ┌──────────────────┐
  │  Off-chain KYC    │────────>│  Semaphore Groups     │<───────│  verifyProof()   │
  │  verification     │  issue  │  (Merkle trees of    │ verify │  => true/false   │
  │                   │  cred   │   identity commits)  │        │                  │
  └───────────────────┘         └──────────┬───────────┘        └──────────────────┘
                                           │ ZK proof
                                ┌──────────┴───────────┐
                                │     User Browser      │
                                │  Semaphore Identity    │
                                │  + Proof Generation    │
                                │  (WASM, client-side)   │
                                └───────────────────────┘
```

## Deployed Contracts (HashKey Chain Testnet)

| Contract | Address |
|----------|---------|
| SemaphoreVerifier | [`0xe874E5DE61fa40dAf82e8916489d1B7071aC3b9A`](https://hashkey-testnet.blockscout.com/address/0xe874E5DE61fa40dAf82e8916489d1B7071aC3b9A) |
| PoseidonT3 | [`0x3B574ED5c34F8CE27E1D6960b69dec3003071301`](https://hashkey-testnet.blockscout.com/address/0x3B574ED5c34F8CE27E1D6960b69dec3003071301) |
| Semaphore | [`0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9`](https://hashkey-testnet.blockscout.com/address/0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9) |
| HSKPassport | [`0x8D379176A95B962687e2edD8AF1f86e1280F4c3C`](https://hashkey-testnet.blockscout.com/address/0x8D379176A95B962687e2edD8AF1f86e1280F4c3C) |
| GatedRWA (hSILVER) | [`0xa36c64bb8E063042a0467Da12ed4cD51F71bAE59`](https://hashkey-testnet.blockscout.com/address/0xa36c64bb8E063042a0467Da12ed4cD51F71bAE59) |

**Credential Groups:**
- Group 0: `KYC_VERIFIED` — Standard KYC verification
- Group 1: `ACCREDITED_INVESTOR` — Professional/accredited investor status
- Group 2: `HK_RESIDENT` — Hong Kong residency

## Tech Stack

- **ZK Layer**: [Semaphore v4](https://semaphore.pse.dev/) (Groth16 zero-knowledge proofs)
- **Smart Contracts**: Solidity 0.8.23, Hardhat
- **Frontend**: Next.js 16, TypeScript, Tailwind CSS
- **Wallet**: ethers.js v6 + MetaMask
- **Chain**: HashKey Chain Testnet (Chain ID 133, OP Stack L2)
- **Proof Generation**: Client-side via WASM (no server)

## Quick Integration

Any dApp on HashKey Chain can gate access behind a KYC credential:

```solidity
interface IHSKPassport {
    function verifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool);
}

contract MyDApp {
    IHSKPassport public passport;

    function kycGatedFunction(
        ISemaphore.SemaphoreProof calldata proof
    ) external {
        require(
            passport.verifyCredential(0, proof), // 0 = KYC_VERIFIED
            "KYC proof required"
        );
        // Your logic here
    }
}
```

## Demo

The demo shows a KYC-gated RWA token (hSILVER) that can only be minted by users who prove their KYC status with a zero-knowledge proof.

1. **Create Identity** — Sign a message to generate a deterministic Semaphore identity
2. **Get Credential** — An issuer adds your identity commitment to the KYC_VERIFIED group
3. **Generate Proof** — Create a Groth16 ZK proof in your browser
4. **Mint Token** — Submit the proof to the GatedRWA contract to mint hSILVER

## Development

### Prerequisites
- Node.js 18+
- MetaMask with HashKey Chain Testnet

### Contracts
```bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network hashkey-testnet
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Why HSK Passport?

HashKey Chain is a compliance-first L2. Every RWA project needs KYC. But current approaches either:
- Expose personal data on-chain (privacy violation)
- Require each dApp to run its own KYC (expensive, fragmented)
- Use centralized whitelists (single point of failure)

HSK Passport solves this with zero-knowledge proofs: one credential, verified by any dApp, with zero personal data on-chain.

## License

MIT
