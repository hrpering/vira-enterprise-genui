# MASTER-17 — Observability + Replay + Action Ledger

## Responsibility

Make the governed interaction chain inspectable and replayable without re-executing enterprise side effects.

```text
Experience shown
      ↓
view changed
      ↓
ActionIntent proposed
      ↓
policy evaluated
      ├── deny ───────────────→ terminal denied
      ├── challenge → approval requested → approval granted
      └── allow / transform
                         ↓
                 action executed / failed
                         ↓
                    retry / recovery
```

Replay example:

```text
Experience v1.4.2
Host / native SDK version
state rev 39
      ↓
user interaction
      ↓
ActionIntent identity
      ↓
policy challenge
      ↓
manager approval
      ↓
ActionReceipt
      ↓
state rev 40
```

## Invariants

1. Existing `telemetry` remains the generic event/export authority.
2. Existing `experience-observability` remains the semantic Experience-event projection authority.
3. MASTER-17 adds an append-only replay/action ledger; it does not create a second telemetry stack.
4. The replay ledger records action identity, revision, governance reason/provider, approval identity and receipt outcome metadata.
5. Raw ActionIntent payloads, principal claims, approval claims, ActionReceipt data, secrets and credentials are never copied into replay entries.
6. Replay contains no executor/dispatcher callback and explicitly declares `sideEffectExecution: "forbidden"`.
7. Replay never invokes Action Boundary, trusted adapters or enterprise backends.
8. An action must be successfully appended as `action.proposed` before later action stages may be recorded.
9. Proposal reservation is transactional: failed timestamp/revision/entry validation cannot reserve an action identity.
10. Policy disposition controls continuation: `deny` is terminal, `challenge` blocks execution until exact approval continuation, and only `allow`/`transform` may cross into execution.
11. Approval can only be requested for an actual `challenge` disposition, and approval grant requires the exact previously recorded challenge.
12. Approval challenge identity is rebound to exact instance/action/actionType/revision/idempotency identity both when requested and when granted.
13. ActionReceipt identity must match the original proposal and cannot regress observed state revision below expected revision.
14. State revision is globally monotonic within one replay session and may never fall below `initialStateRevision` or any previously appended entry revision.
15. Ledger sequence is deterministic, zero-based and append-only within one replay session.
16. Session identity includes exact Experience version, platform Host identity/version and initial state revision.
17. Retry requires a prior failed terminal outcome, may be recorded once, and recovery requires that retry and may also be recorded once.
18. Ledger telemetry is derived through `experience-observability`; action lifecycle semantics are not forked into a second telemetry schema.
19. A denied policy produces both `experience.policy.evaluated` and the existing `experience.action.denied` observation without manufacturing an executable ledger stage.
20. MASTER-17 extends Experience telemetry with `experience.shown`, `view.changed`, `action.proposed`, `policy.evaluated`, `approval.requested`, `approval.granted`, `action.executed`, `action.failed`, `action.denied`, `action.retry` and `action.recovery` semantics.
21. Audit/compliance storage remains a separate enterprise concern. This replay ledger is intentionally privacy-minimized and is not a raw audit payload sink.
22. Retry/recovery records observation only; they do not imply automatic replay of the original side effect.
23. No raw secret, SecretRef lease material, model prompt or arbitrary telemetry attributes are introduced.

## RE/QC findings closed

- generic telemetry and Experience observability already existed, so MASTER-17 composes them rather than replacing them;
- the first ledger slice reserved action identity before append validation; reservation now occurs only after the proposal entry is successfully appended;
- approval-granted originally checked only challenge ID; exact challenge identity is now revalidated before grant recording;
- initial stage tracking only knew that "some policy" had run, which allowed challenge-without-approval execution and deny continuation; exact policy disposition now controls continuation;
- deny is terminal and projects a dedicated denied telemetry observation while remaining represented by the original policy-evaluated ledger entry;
- retry/recovery notes are bounded instead of becoming an unbounded text side-channel;
- successful ActionReceipt metadata includes action effect and observed revision while excluding receipt data payload;
- replay revisions initially validated each entry independently; they now enforce one monotonic session-wide revision timeline;
- recovery was initially repeatable; it is now a single-shot observation after a single retry;
- existing Experience Observability contract tests used exact closed-taxonomy equality and were updated intentionally for the MASTER-17 additive semantic vocabulary.

## Verification policy

Hosted CI remains deferred. Final local/full CI must cover the full replay chain, challenge/approval gating, deny terminal behavior, deny telemetry, monotonic revisions, invalid timestamps, cross-instance/cross-action approval and receipt rejection, failed proposal non-reservation, single-shot retry/recovery semantics, raw payload/claims/data exclusion, deterministic sequence ordering and the guarantee that replay cannot execute side effects.
