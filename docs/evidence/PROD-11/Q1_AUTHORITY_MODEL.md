# PROD-11 Q1 — Approval and Execution-Grant Authority Model

## Authority chain

```text
Frozen TransactionPlan
  transactionId
  planDigest
  planRevision
        |
        +--> comprehension projection (read-only, non-authoritative)
        |
        +--> human ApprovalEvidence
               issuer.kind = user
               exact transactionId + planDigest + planRevision
               approval decision + issued/expiry time
                        |
                        +--> per-operation ExecutionGrant
                               exact transactionId + planDigest + planRevision
                               exact operationId
                               exact enterprise scope
                               fixed execution audience
                               nonce
                               issuedAt / expiresAt
                               keyRef / signature
                               replay-guard contract
```

## Ownership decisions

1. `action-transaction` remains owner of the frozen TransactionPlan and mutable TransactionRecord schema. PROD-11 must not recompute plan meaning from mutable record state.
2. Comprehension is a pure projection of `ViraFrozenTransactionPlan`. It can summarize target, provider, risk, reversibility, policy obligations, commercial preflight and operation ordering, but it cannot create authority or accept replacement values from UI state.
3. ApprovalEvidence is a distinct authority artifact. It must bind all three plan coordinates: `transactionId`, `planDigest`, `planRevision`.
4. Only an enterprise `user` principal may issue human ApprovalEvidence. `agent` and `service` principals fail closed for the human-approval path.
5. ExecutionGrant is operation-scoped and one-time by contract. Approval of one plan cannot authorize another digest/revision, and a grant for one operation cannot authorize another operation.
6. Signing is injected through a KMS/signer interface. Domain code stores key references/signature bytes or encoded signature only; it never stores long-lived key material.
7. PROD-11 owns nonce identity, replay rejection semantics and an injected replay-guard boundary suitable for focused tests. **Durable atomic nonce consumption, PostgreSQL/CAS/fencing and side-effect reservation are PROD-12 owners and must not be implemented here.**

## Required negative evidence

- stale review projection submitted against a newer digest/revision
- changed target, payload/amount, provider or exact version after review
- approval emitted by `agent` or `service`
- approval from another tenant scope or transaction
- approval/grant expiry
- wrong grant audience
- operation substitution
- repeated nonce rejected by the replay-guard contract
- signature/key-reference mismatch
- signer/verifier/replay-guard failure must fail closed

## Reuse / non-reuse findings

- Reuse enterprise-context canonical scope and principal parsing.
- Reuse the signed-webhook security pattern of snapshot-before-await and transient key handling; do not reuse its inbound HMAC receipt as grant authority.
- Reuse trigger-inbox replay/conflict design principles; do not couple execution grants to trigger records.
- Do not add durable nonce persistence, provider execution, Action retry, attempt ledgers or compensation in PROD-11.
