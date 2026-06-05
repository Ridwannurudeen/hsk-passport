# Ethereum Foundation — Privacy & Scaling Explorations Grant (DRAFT)

> **DRAFT — not submitted.** Fill `{{...}}` placeholders and get owner approval
> before sending. PSE grant rounds and scope change over time — confirm the
> current call/format before applying. See [funding README](./README.md).

- **Project:** HSK Passport — privacy-preserving ZK credentials built on Semaphore v4
- **Applicant:** {{LEGAL_ENTITY}}
- **Contact:** {{CONTACT}}
- **Payout:** {{PAYOUT_ADDRESS}}
- **Amount requested:** {{AMOUNT_REQUESTED}}
- **Repo:** https://github.com/Ridwannurudeen/hsk-passport · **Live:** https://hskpassport.gudman.xyz

## Summary

HSK Passport is an applied **Semaphore v4** identity primitive: a wallet-bound,
privacy-preserving KYC credential that any dApp can verify with a single call,
revealing only group membership — no PII on-chain. It is a concrete, deployed
example of the privacy tooling PSE stewards, extended with a custom Circom
**credential-freshness** circuit that proves a credential was issued within a
validity window without revealing the holder.

## Alignment with PSE

- **Builds on PSE-stewarded tech:** Semaphore v4 (Groth16, bn254, Poseidon),
  using the Ethereum-Foundation ceremony trusted setup.
- **Privacy as a public good:** the design, contracts, SDK, and a custom circuit
  are MIT-licensed and reusable beyond HashKey Chain — the gate pattern is
  chain-agnostic.
- **Advances the practice:** documents real-world edge cases of anonymous
  credential systems (group-vs-per-prover expiry, anonymity-set floors,
  backend-correlation) openly in [audit history](../../audits/README.md) and the
  roadmap, rather than hiding them.

## Technical contribution

- `circuits/src/credential_freshness.circom` — per-prover issuance-window proof
  (137 LOC), separate from the Semaphore identity path so freshness can be proven
  without de-anonymizing the holder.
- Anti-replay/front-running binding (`proof.message == msg.sender`) and
  deterministic per-`(identity, scope)` nullifiers, all open-source.
- A published SDK and runnable examples lowering the barrier for other teams to
  adopt Semaphore-based credentials.

## What the grant funds

Independent security review of the **circuit + core contracts** (full scope:
[`audits/external-audit-scope.md`](../../audits/external-audit-scope.md)). A
funded audit of an applied Semaphore deployment also produces public artifacts
(the report, fixes) that benefit other Semaphore integrators.

## Budget

| Item | Estimate |
|---|---|
| Circuit review (`credential_freshness.circom`) + ZK-integration soundness | portion of below |
| Core contract audit (~1,900 LOC) | — |
| Combined engagement, 6–8 weeks + remediation | $100,000–$200,000 |
| **Request to PSE** | **{{AMOUNT_REQUESTED}}** (co-funded with a HashKey ecosystem grant) |

## Deliverables (public)

1. Published audit report under `audits/`.
2. Remediation PRs with auditor sign-off.
3. A short write-up of ZK findings/edge cases reusable by the Semaphore community.

## Team

{{TEAM}}
