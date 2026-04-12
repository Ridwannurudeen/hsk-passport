# Security Policy

## Supported Versions

| Version | Status |
|---------|--------|
| v3.x (current testnet) | Active |
| v2.x | Deprecated — use v3 |
| v1.x | Deprecated — use v3 |

## Reporting a Vulnerability

If you discover a security vulnerability in HSK Passport contracts, SDK, or backend, please **do NOT** open a public GitHub issue.

Instead, send a private report to:

- GitHub Security Advisories: https://github.com/Ridwannurudeen/hsk-passport/security/advisories
- Email: (contact via GitHub profile)

### Please include:
- A description of the vulnerability and its impact
- Steps to reproduce (including relevant transactions, proofs, or input data)
- Suggested mitigation (if any)
- Whether you've discussed this with anyone else

We aim to respond within 48 hours and coordinate responsible disclosure.

## In Scope

- Smart contracts deployed at the addresses listed in `README.md` / `PROTOCOL.md`
- TypeScript SDK (`@hsk-passport/sdk`)
- Indexer backend and REST API
- ZK circuit trust assumptions (Groth16, Semaphore v4 trusted setup)

## Out of Scope

- Third-party KYC provider vulnerabilities (they have their own disclosure policies)
- User-side wallet compromise
- Social engineering attacks on issuers
- Rate limiting / DoS on public RPC (not controlled by this protocol)

## Known Limitations

These are documented trade-offs, not vulnerabilities:

1. **Trusted setup**: Semaphore v4 uses a Groth16 trusted setup conducted by the Ethereum Foundation's PSE team. Trust assumptions inherited.
2. **Issuer trust**: The protocol relies on approved issuers correctly verifying off-chain identity. A compromised issuer could add unauthorized identity commitments to a group. Mitigation: issuer reputation tracking, multi-sig issuer addresses, auditable event logs.
3. **Anonymity set size**: Groups with fewer than ~10 active members provide weak anonymity. UI warns users when the anonymity set is too small.
4. **Nullifier linkability**: The same identity + scope always produces the same nullifier. A verifier submitting multiple proofs under the same scope can link them. Mitigation: use distinct scopes per action.
5. **Public group membership**: On-chain `CredentialIssued` events are public. While the mapping from commitment to identity is private, the total membership count and issuance timeline are visible.

## Security Design Principles

- **Caller-bound proofs**: `GatedRWA.kycMint` and similar enforce `proof.message == uint256(uint160(msg.sender))` to prevent front-running.
- **Per-group delegate isolation**: A delegate approved for group A cannot issue credentials in group B. Each issuer maintains their own delegate set.
- **Revocation-aware proofs**: Client-side proof generation filters revoked members before reconstructing the Merkle tree, so revoked credentials fail verification immediately.
- **Action-scoped nullifiers**: Nullifiers are bound to `(groupId, scope)` so sybil resistance can be enforced per-action without preventing legitimate reuse across different actions.

## Audit Status

- **No formal audit** has been performed at this time. This is testnet-only code.
- 26 Hardhat tests cover the critical surface: issuance, revocation, delegate isolation, proof verification, nullifier reuse, caller binding.
- Before mainnet deployment, a third-party audit is planned (see ROADMAP.md Q2 2026).
