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
      ↓
approval requested / granted
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
8. An action must be successfully appended as `action.proposed` before policy, approval, execution, retry or recovery stages may be recorded.
9. Proposal reservation is transactional: failed timestamp/revision/entry validation cannot reserve an action identity.
10. Approval challenge identity is rebound to exact instance/action/actionType/revision/idempotency identity both when requested and when granted.
11. ActionReceipt identity must match the original proposal and cannot regress observed state revision below expected revision.
12. Ledger sequence is deterministic, zero-based and append-only within one replay session.
13. Session identity includes exact Experience version, platform Host identity/version and initial state revision.
14. Ledger telemetry is derived through `experience-observability`; action lifecycle semantics are not duplicated in the ledger package.
15. MASTER-17 extends Experience telemetry with: `experience.shown`, `action.proposed`, `policy.evaluated`, `approval.requested`, `approval.granted`, `action.executed`, `action.failed`, `action.retry`, `action.recovery`.
16. Audit/compliance storage remains a separate enterprise concern. This replay ledger is intentionally privacy-minimized and is not a raw audit payload sink.
17. Retry/recovery records observation only; they do not imply automatic replay of the original side effect.
18. No raw secret, SecretRef lease material, model prompt or arbitrary telemetry attributes are introduced.

## RE/QC findings closed

- generic telemetry and Experience observability already existed, so MASTER-17 composes them rather than replacing them;
- the first ledger slice reserved action identity before append validation; reservation now occurs only after the proposal entry is successfully appended;
- approval-granted originally checked only challenge ID; exact challenge identity is now revalidated before grant recording;
- retry/recovery notes are bounded instead of becoming an unbounded text side-channel;
- successful ActionReceipt metadata includes action effect and observed revision while excluding receipt data payload;
- existing Experience Observability contract tests used exact closed-taxonomy equality and were updated intentionally for the MASTER-17 additive semantic vocabulary.

## Verification policy

Hosted CI remains deferred. Final local/full CI must cover the full replay chain, telemetry projection, invalid timestamps, cross-instance/cross-action approval and receipt rejection, failed proposal non-reservation, retry/recovery semantics, raw payload/claims/data exclusion, deterministic sequence ordering and the guarantee that replay cannot execute side effects.
