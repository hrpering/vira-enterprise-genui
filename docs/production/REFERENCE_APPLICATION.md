# Production MVP Reference Application — Governed Employee Offboarding

**Freeze:** PROD-00  
**Purpose:** one narrow Application that exercises the full Production MVP architecture without creating special-case semantics.

## Pilot users

1. **IT Operator** — starts/monitors offboarding, resolves provider connection issues and handles failed/waiting work without bypassing policy.
2. **Security Approver** — reviews one exact TransactionPlan digest and grants/denies the protected multi-provider change.
3. **Manager / Requester** — supplies business context and successor ownership input through a Human Task when needed.
4. **Auditor / FinOps reviewer** — inspects immutable evidence, verified usage/pricing/export and does not receive execution authority.

## Entry points

Production MVP supports the same Application through declared entrypoints:

- Vira Chat/user request;
- Studio/Web UI;
- authenticated API;
- later activation may bind webhook/event or schedule only through environment trigger configuration.

No trigger bypasses identity, governance or required approval.

## Reference flow

```text
request offboarding
→ resolve exact active Application release
→ read current GitHub membership (query Capability)
→ read Google Workspace user state (query Capability)
→ enumerate Drive ownership requiring transfer (query / async query)
→ Human Task: confirm successor owner when required
→ construct immutable multi-operation TransactionPlan
    1. transfer designated Drive ownership/resources
    2. suspend Google Workspace account
    3. remove GitHub organization membership/access
→ governance + Action Boundary preflight
→ Security Approver reviews exact plan digest
→ one-time execution grant
→ durable private execution respecting operation dependencies
→ provider-specific reread/postcondition verification
→ append Action Ledger evidence + transactional outbox
→ create immutable offboarding report Artifact
→ emit verified usage/rating/pricing evidence for invoice-grade export
→ terminal ApplicationRun
```

## Why this is the reference slice

It forces the platform to prove the hard boundaries instead of a demo shortcut:

- GitHub + Google Workspace are both real providers;
- reads and protected writes are distinct;
- Human Task is separate from Transaction Approval;
- the transaction has multiple dependent operations and does not claim cross-provider ACID;
- provider `2xx` is insufficient without reread/postcondition verification;
- a durable run may wait for a human or async provider work and survive restarts;
- artifacts have exact identity/lineage rather than being chat blobs;
- entitlement/metering/pricing/export can attach to the same verified execution evidence.

## Negative proofs required by owning phases

- actor from another tenant cannot read/claim/approve/execute the run;
- prompt/provider/artifact content cannot inject an undeclared Action;
- stale plan/resource version forces re-observation and re-approval;
- duplicate webhook/event/resume cannot execute twice;
- expired/revoked provider connection fails closed;
- uncertain provider effect is never blindly retried;
- approval of Human Task completion is not treated as transaction approval;
- wrong/old Application or Action version cannot resolve implicitly.
