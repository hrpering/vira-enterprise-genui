# PROD-11 — Transaction Comprehension, Approval Inbox and One-Time Execution Grants

Status: ACTIVE / STACKED IMPLEMENTATION / NOT MERGE AUTHORIZED

Dependency: PROD-10 exact closed candidate `2a3dcd98079e8f9e077d4df7253fed74a5b877d4` (CI #1967 GREEN).

## Goal

Turn the immutable TransactionPlan into a human-reviewable transaction without weakening its authority boundary, then bind human approval and one-time per-operation execution grants to that exact frozen plan.

## In scope

1. Pure TransactionPlan comprehension projection rendered only from a `ViraFrozenTransactionPlan`.
2. Approval Inbox contract/view model that carries frozen identifiers, never editable execution meaning.
3. Human `ApprovalEvidence` bound to exact enterprise scope, `transactionId`, `planDigest`, `planRevision`, approving user principal, decision and bounded validity window.
4. Per-operation signed execution grant bound to exact scope, transaction coordinates, `operationId`, fixed execution audience, nonce, issued/expiry timestamps and signer/key reference.
5. Injected signer/KMS boundary and verifier boundary with no long-lived key bytes in domain state.
6. Replay-guard contract for one-time grant semantics and focused repeated-nonce rejection tests. Durable atomic nonce consumption remains PROD-12.
7. Focused positive and negative contract tests.
8. Root package-boundary, lint, strict typecheck, build and exact-head CI evidence.

## Explicitly out of scope

- provider Action execution
- durable/atomic nonce persistence or CAS consumption
- Action attempt persistence
- retry / compensation / recovery
- action ledger or receipt ownership
- PROD-12 transaction executor
- provider-specific KMS SDK wiring
- mutable UI fields that can alter the frozen plan

## Security invariants

- Review content is derived from the frozen plan and is never an authority source.
- Approval never targets only a transaction id; it always binds the exact digest and revision.
- Human approval requires `issuer.kind === "user"`; agent/service self-approval fails closed.
- A changed target, payload/amount, Action version, provider, policy/commercial meaning or operation graph requires a different plan digest/revision and invalidates stale approval.
- One approval may satisfy only the exact plan it names.
- One execution grant authorizes only one exact operation and one exact audience.
- Grant expiry is checked before replay-guard acceptance.
- Signature verification succeeds before replay-guard acceptance.
- Repeated nonce use is rejected by the PROD-11 replay-guard contract; durable atomic consumption is implemented only in PROD-12.
- Cross-scope approval/grant substitution fails closed.
- Signer/verifier/replay-guard failures fail closed.
- No secret or KMS key bytes are serialized into ApprovalEvidence, grants, review models or TransactionRecord.

## Owner plan

- `action-transaction` remains the single transaction aggregate owner. `approval.ts` owns comprehension, ApprovalEvidence, execution-grant envelope, signer/verifier interfaces and the PROD-11 replay-guard contract while `plan.ts` remains the frozen-plan owner.
- No second transaction/approval workspace package is introduced; this avoids a parallel aggregate owner and dependency cycle.
- Studio/host review UI consumes only the comprehension projection and authority-safe identifiers.
- `enterprise-context` remains canonical scope/principal owner.
- Do not place transaction approval/grant authority in generic governance or webhook integrations.

## Required negative tests

- stale plan digest / stale plan revision
- changed exact Action version / target / payload
- cross-tenant scope
- AI/service approval
- wrong transaction
- wrong operation
- wrong audience
- expired approval / grant
- malformed signature / wrong key reference
- signer/verifier failure
- first replay-guard acceptance succeeds, repeated nonce is rejected
- replay-guard failure cannot grant authority
- mutable caller state changed while signer/verifier awaits cannot alter signed/verified snapshot

## Exit gates

1. Q0 baseline recorded.
2. Q1 authority model recorded.
3. Domain owner + focused tests green.
4. Comprehension/Approval Inbox projection tests green.
5. Negative security matrix green.
6. Package boundaries green.
7. lint + strict TypeScript + full tests + builds green.
8. repository/browser gates green.
9. iOS + Android native jobs green on the exact final candidate HEAD.
10. Q8 reverse-engineering evidence records the exact candidate and confirms no PROD-12 durable execution/nonce authority leaked into PROD-11.

**DRAFT / NOT MERGE AUTHORIZED.**
