# HSK Passport — Demo Video Script (2 minutes)

## Recording Setup
- Chrome with MetaMask, HashKey Chain Testnet added
- https://hskpassport.gudman.xyz open
- Funded wallet with testnet HSK
- Screen recording at 1080p, clean desktop

---

## Script

### Opening (0:00 – 0:15)
**[Show landing page hero]**

> "HashKey Chain is built for compliance. Every RWA token, every DeFi protocol needs to verify users. But compliance today means exposing personal data on-chain — or forcing every dApp to run its own KYC."

> "HSK Passport solves this with zero-knowledge proofs."

### Architecture (0:15 – 0:30)
**[Scroll to architecture diagram on landing page]**

> "The protocol has three roles. Issuers — like HashKey Exchange — verify users off-chain and add cryptographic commitments to credential groups on-chain. Holders generate ZK proofs in their browser. Verifiers — any dApp — call one function to check the proof. No personal data touches the blockchain."

### Protocol Features (0:30 – 0:45)
**[Show /docs page — contract addresses, credential groups table]**

> "HSK Passport is a full protocol: a credential registry with W3C-aligned schemas, multiple credential types — KYC, accredited investor, HK resident — a delegate system for authorized issuance, credential revocation, and a TypeScript SDK with React hooks. All deployed on HashKey Chain testnet."

### Live Demo (0:45 – 1:30)
**[Navigate to /demo]**

> "Let me show the full flow."

**Step 1 (0:45 – 0:55): Connect & Create Identity**
- Click "Connect Wallet & Create Identity"
- Sign MetaMask message
> "I sign a message to create a deterministic Semaphore identity. This generates an EdDSA keypair — the private key never leaves my browser."

**Step 2 (0:55 – 1:05): Issue Credential**
- Click "Issue Demo KYC Credential"
- Wait for tx confirmation
> "The DemoIssuer contract adds my identity commitment to the KYC_VERIFIED group on-chain. In production, this would follow real KYC verification."

**Step 3 (1:05 – 1:20): Generate ZK Proof**
- Click "Generate Zero-Knowledge Proof"
- Show spinner, wait for proof
> "Now I generate a Groth16 zero-knowledge proof entirely in my browser. This proves I'm in the KYC group — without revealing which member I am."

**[Show ProofCard when it appears]**
> "My identity is hidden among all group members."

**Step 4 (1:20 – 1:30): Mint Token**
- Click "Mint hSILVER with KYC Proof"
- Wait for tx
> "I submit the proof to the GatedRWA contract. It verifies on-chain, and mints 100 hSILVER tokens. The contract verified my KYC status — but learned nothing about who I am."

### Integration + Close (1:30 – 2:00)
**[Show /docs page — code snippets]**

> "For developers: inherit HSKPassportVerifier, add one modifier, and any function is KYC-gated. The SDK handles proof generation with three lines of TypeScript."

**[Show code snippet]**

> "HSK Passport. Prove compliance. Preserve privacy. Built for HashKey Chain."

**[Show landing page with logo]**

---

## Key Points for Judges
1. **Working on-chain**: All contracts deployed and verified on HashKey Chain testnet
2. **Real ZK proofs**: Groth16 via Semaphore v4, not simulated
3. **Protocol, not just a demo**: Schema registry, SDK, verifier base contract, 21 tests
4. **HashKey-specific value**: Designed for their compliance requirements, composable with HashKey DID
5. **21 tests passing**: Full test coverage of contract functionality
