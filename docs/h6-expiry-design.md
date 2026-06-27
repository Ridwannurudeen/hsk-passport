# H6 expiry design

Status: design note, not implemented.

## Bug

`HSKPassport.verifyCredentialWithExpiry(groupId, proof, earliestAcceptableIssuance)`
currently lets the caller choose `earliestAcceptableIssuance`. The contract only
checks:

```solidity
if (block.timestamp > earliestAcceptableIssuance + validity) {
    revert CredentialExpired();
}
```

Because `earliestAcceptableIssuance` is not derived from contract state and is
not bound to the Semaphore proof, a caller can pass the current timestamp, or any
timestamp inside the validity window, and the expiry check passes. The proof still
only proves group membership.

## Why the naive fix fails

The obvious-looking patch is to remove the argument and compute:

```solidity
uint256 earliestAcceptableIssuance = block.timestamp - validity;
```

inside the function. Used with the current predicate, that becomes:

```solidity
block.timestamp > (block.timestamp - validity) + validity
```

which simplifies to:

```solidity
block.timestamp > block.timestamp
```

That is always false, so expiry would never fire. The deeper issue is not the
caller-controlled argument by itself. The contract has no expiry signal that is
bound to the anonymous prover. It must either enforce a group-level freshness
invariant from on-chain issuance state, or verify a ZK statement about the
prover's own issuance time.

## Option A: on-chain issuance-time enforcement

This option keeps expiry in Solidity and avoids a new circuit. The contract must
derive freshness from issuance timestamps it controls, never from caller input.

There are two variants:

1. **Group-oldest freshness.** Track the oldest active issuance timestamp per
   group. If `oldestActiveIssuedAt + validity < block.timestamp`, the entire
   group is stale and `verifyCredentialWithExpiry` reverts for everyone.
2. **Per-credential lookup.** Use `credentialIssuedAt[groupId][commitment]` for
   the holder being verified.

The group-oldest variant is privacy-preserving and correct but conservative. One
old active credential can make the whole group fail until it is revoked or the
group is rotated. It also needs careful state maintenance so revoking the oldest
credential advances the oldest timestamp without an unbounded scan.

The per-credential lookup is operationally nicer but does not fit the current
anonymous API. `verifyCredentialWithExpiry` receives a Semaphore proof, not the
holder commitment. Passing the commitment would let the contract look up
`credentialIssuedAt`, but it would also reveal which member is proving. That is a
different product surface, not a privacy-preserving expiry fix.

Migration sketch for group-oldest enforcement:

1. Add `oldestActiveIssuedAt[groupId]` and update it on issuance.
2. Add a bounded data structure, epoch model, or group rotation process so
   revoking the oldest credential does not require scanning all members.
3. Change `verifyCredentialWithExpiry` to use only
   `oldestActiveIssuedAt[groupId]` and `credentialGroups[groupId].validityPeriod`.
4. Treat a group with no recorded active issuance as not fresh.
5. Document that this is a group freshness gate, not per-holder expiry.

## Option B: per-credential ZK range proof

This option preserves the product semantics: each holder proves their own
credential is fresh without revealing which commitment they own.

The circuit would prove, in one statement:

1. The prover knows the Semaphore identity secret for a member in `groupId`.
2. The same hidden identity is associated with an issuance timestamp committed in
   an issuance/freshness tree.
3. `issuanceTime + validityPeriod >= block.timestamp`, or equivalently
   `issuanceTime >= block.timestamp - validityPeriod`.
4. The public signal binds the proof to the dApp's expected scope/message so it
   cannot be replayed in a different context.

The contract would verify this new proof type through a dedicated verifier. It
would not accept a caller-provided freshness lower bound.

Pros:

- Per-holder expiry semantics.
- Preserves anonymity.
- Does not make one stale credential break the whole group.

Cons:

- Requires circuit work, proof generation, verifier deployment, and a migration
  path for existing credentials.
- Requires a canonical issuance/freshness tree and root lifecycle.
- Needs external review because it expands the ZK trust surface.

Migration sketch:

1. Keep the current `verifyCredential` path for non-expiring credentials.
2. Mark `verifyCredentialWithExpiry` as deprecated for regulated integrations.
3. Introduce a new verifier contract and proof struct for fresh credential proofs.
4. Have issuers write issuance-time leaves at credential issuance.
5. Re-issue or explicitly backfill active credentials into the freshness tree.
6. Move regulated dApps to the new fresh-proof verifier.
7. Remove or hard-revert the old caller-bounded function in the next breaking
   contract release.

## Recommendation

Use Option B for production expiry. It is the only option that gives
per-credential freshness while preserving HSK Passport's anonymity model.

Option A is acceptable only as a deliberately conservative interim gate for
credential groups that can tolerate epoch rotation or whole-group stale windows.
It should be named and documented as group freshness, not holder expiry.

Do not ship the naive `block.timestamp - validity` patch. It compiles, but it
removes expiry in practice.

## Sibling Medium: importer and bridge commitment binding

`HashKeyKYCImporter` and `HashKeyDIDBridge` already bind a source wallet, DID, or
DeedGrain holder to the first commitment they import. That prevents one source
from repeatedly minting new commitments after the first import. It does not prove
the caller knows the Semaphore identity secret behind the commitment.

A clean front-running fix needs a proof of knowledge bound to the importer or
bridge action. A wallet signature over the commitment is not sufficient: it only
proves the wallet authorized the import, not that the wallet controls the
Semaphore identity whose commitment is being imported. The robust fix is a
bridge/import proof that binds the hidden identity to the caller or source
credential, with the bridge contract checking the expected scope/message.

Revocation propagation has a similar boundary. `HSKPassport.revokeCredential`
requires Merkle proof siblings for the member being removed. The HashKey KYC,
DID, and DeedGrain source contracts expose current source status, but they do not
provide the HSK Passport tree proof needed to remove the anonymous commitment. A
manual revocation channel that accepts proof siblings is possible, but it still
needs an operator flow and ordering rules for source revocation, DID transfer or
burn, and HSK group removal.

Recommendation for these bridge Mediums:

1. Do not add a wallet-signature-only commitment binding and call it fixed.
2. Design an import proof of knowledge, likely reusing Semaphore message/scope
   binding, before changing bridge issuance.
3. Add a separate revocation operator flow that supplies HSK Passport Merkle
   siblings and clearly handles source-status checks.
4. Ship both behind tests and external review because the changes alter the
   trust boundary between source credentials and anonymous Passport membership.
