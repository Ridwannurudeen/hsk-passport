# Audit History

HSK Passport has been through **three rounds of security review** during development. All CRITICAL, HIGH, and MEDIUM findings have been closed before submission. Low/informational items are tracked in [/roadmap](https://hskpassport.gudman.xyz/roadmap).

| Round | Scope | CRITICAL | HIGH | MEDIUM | Status |
|-------|-------|:---:|:---:|:---:|:---:|
| [Round 1](round-1.md) | Contracts, initial design | — | 4 | 5 | ✅ Closed |
| [Round 2](round-2.md) | Audit-fix deployment (v4) + bridge expansion | — | 3 | 5 | ✅ Closed |
| [Round 3](round-3.md) | Backend + frontend after v5 redeploy | 2 | 2 | 5 | ✅ Closed |

**Total**: 26 findings reviewed, 26 closed before submission. Evidence lives in this folder.

## Threat model

The public [/roadmap](https://hskpassport.gudman.xyz/roadmap) page lists what HSK Passport *does not yet* protect against. Summary:

- **Backend-correlation risk**: our backend knows `commitment ↔ Sumsub applicant ID`. Blind-signature issuance is on the roadmap.
- **Anonymity-set floor**: testnet groups have <50 members; production enforces ≥1,000 per jurisdiction.
- **Formal audit**: planned for mainnet milestone (Trail of Bits / OpenZeppelin / Spearbit).
- **Biometric binding**: an identity-key theft equals a credential theft until biometric binding ships.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md) at the repo root.
