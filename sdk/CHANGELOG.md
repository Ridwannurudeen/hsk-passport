# Changelog

All notable changes to `hsk-passport-sdk` are documented here.

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
