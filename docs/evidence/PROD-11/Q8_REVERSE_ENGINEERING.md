# PROD-11 — Transaction Comprehension, Approval Inbox, and KMS Grant Reverse Engineering

## Q0 — Current-State Inventory

1. Frozen transaction review
   - The frozen `TransactionPlan` is the semantic source for transaction comprehension and review.
   - Review data is projected from that frozen plan rather than reconstructed from mutable runtime state.
   - The review projection is immutable and excludes execution secrets.

2. Approval Inbox
   - Inbox items identify the exact transaction review using `transactionId`, `planDigest`, and `planRevision`.
   - Inbox presentation is not an independent execution or approval authority.
   - A stale or substituted plan identity must not be accepted merely because mutable transaction state still exists.

3. `ApprovalEvidence`
   - Human approval is bound to the exact `transactionId` + `planDigest` + `planRevision` tuple.
   - Rejected evidence cannot authorize grant minting.
   - AI/service principals cannot self-approve a protected transaction.

4. KMS execution grant
   - Execution authority produced in this phase is a signed, one-time, operation-scoped grant.
   - The signed authority binds audience, operation, expiry, nonce, and KMS verification identity.
   - Replay, expiry, audience/operation mismatch, and key/signature substitution are rejected.

5. Durable execution
   - PROD-11 does not own durable execution lifecycle, transaction execution persistence, or ledger semantics.
   - Those responsibilities remain intentionally deferred to PROD-12.

## Q1 — Target Boundary

The security boundary for PROD-11 is therefore:

- render comprehension from the exact frozen `TransactionPlan`,
- expose an immutable, secret-free review projection,
- bind approval evidence to exact plan identity,
- mint an execution grant only from approved human evidence,
- sign the grant over the intended audience, operation, lifetime, nonce, and verification identity,
- reject staleness, semantic drift, self-approval, substitution, expiry, and replay,
- refuse to claim durable execution authority.

A changed target, amount, or provider/version semantics belongs to a changed plan digest. A pure revision change can still make an otherwise digest-identical review stale, so approval validation must bind both digest and revision.

## Q8 — Reverse-Engineering Closure

### Authority owners

- Transaction comprehension authority owner: frozen `TransactionPlan` and its review projection.
- Approval authority owner: `ApprovalEvidence` bound to exact plan identity.
- Grant authority owner: signed one-time operation-scoped KMS execution grant.
- Durable execution authority: intentionally absent in PROD-11 and deferred to PROD-12.

### Negative guarantees

The focused PROD-11 contract/security coverage proves:

- stale plan revision is rejected,
- changed target, amount, or version semantics cannot reuse an older approval binding,
- AI/service self-approval is rejected,
- rejected `ApprovalEvidence` cannot mint an execution grant,
- wrong audience is rejected,
- wrong operation is rejected,
- expired authority is rejected,
- KMS key/signature substitution is rejected,
- nonce/grant replay is rejected,
- caller mutation during asynchronous signing cannot change the signed snapshot,
- Approval Inbox/review identity remains bound to exact digest and revision,
- the review projection remains immutable and secret-free.

### Parent geometry

PROD-11 is stacked on PROD-10. It does not reassign PROD-10 ownership of exact `ActionSupply`, immutable `TransactionPlan`, or Stage-A preflight validation, and it does not pull PROD-12 durable execution/ledger ownership forward.

### Exact-head candidate evidence

Implementation candidate:

`6bd44d63afbbc55fc0844df4c36db0201de09a97`

GitHub Actions candidate run:

- run: `#1995` (`34062423670`)
- Verify: PASS
- iOS Native: PASS
- Android Native: PASS
- repository/browser `verify:all`: PASS

This candidate demonstrates that the PROD-11 implementation and its contract/security matrix are green before this evidence-only documentation commit.

### Closure state

The implementation candidate is green. This Q8 evidence commit creates a new documentation-only branch HEAD, so technical closure still requires one final exact-head CI run for that new SHA.

Merge remains a separate explicit action and is not authorized by this evidence record.
