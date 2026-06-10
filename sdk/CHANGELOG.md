# Changelog

All notable changes to `hsk-passport-sdk` are documented here.

## [1.2.0] — 2026-06-10

### Added
- HashKey Chain mainnet support (chain ID 177) via `HSKPassport.connect("hashkey-mainnet")` — deployed in safe mode, read-only until post-audit
- Credential-freshness ZK module (`./freshness` subpath export): `FreshnessTree`, `createFreshnessIdentity`, `generateFreshnessProof`, `HSKPassportFreshnessClient` — prove a credential is within a freshness window without revealing the identity commitment or issuance time

### Changed
- Credential group IDs are now 25–29: `KYC_VERIFIED (25)`, `ACCREDITED_INVESTOR (26)`, `HK_RESIDENT (27)`, `SG_RESIDENT (28)`, `AE_RESIDENT (29)`
- `getGroupMembers` pages `eth_getLogs` in fixed block windows so public RPCs no longer reject the query
- `generateProof` reconstructs the Semaphore group by replaying every issuance and zeroing revoked leaves in place, so the off-chain Merkle root matches the on-chain root
- `snarkjs` is lazy-loaded inside the freshness module so importing the main entry never pulls it in (browser/Next.js friendly)
- `ethers` and `@semaphore-protocol/*` moved to `peerDependencies`

## [1.0.0] — 2026-04-12

### Added
- Initial public release
- `HSKPassport.connect()` for ethers signer/provider integration
- `HSKPassport.createIdentity()` for deterministic Semaphore identity creation
- `HSKPassport.getCredentials()` for querying credential status
- `HSKPassport.generateProof()` for Groth16 proof generation
- `HSKPassport.verifyProof()` for read-only on-chain verification
- `HSKPassport.submitProof()` for nullifier-tracked validation
- `HSKPassport.getGroupInfo()` for on-chain group metadata
- `HSKPassport.getGroupMembers()` with revocation-aware filtering
- React component `<HSKPassportGate>` with callback-based proof flow
- `useHSKPassport()` React hook
- Full TypeScript types
- Support for HashKey Chain testnet (chain ID 133)

### Networks supported
- `hashkey-testnet` (chain ID 133)

### Credential groups (testnet)
- KYC_VERIFIED (15)
- ACCREDITED_INVESTOR (16)
- HK_RESIDENT (17)
- SG_RESIDENT (18)
- AE_RESIDENT (19)

### Dependencies
- `@semaphore-protocol/identity@^4.14.2`
- `@semaphore-protocol/group@^4.14.2`
- `@semaphore-protocol/proof@^4.14.2`
- `ethers@^6.13.0`
