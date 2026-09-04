# MASTER-23 — Pegasus Extraction

Status: CODE-COMPLETE / FINAL-CI-PENDING for the Vira-core side of the extraction. External proof evidence remains a MASTER-25 release dependency.

## Goal

Keep Pegasus, airline and flight domain semantics outside `vira-enterprise-genui` while defining the exact acceptance contract an external brand proof must satisfy against the generic Vira stack.

## Authority split

```text
vira-enterprise-genui
  ├─ generic Pack / resolver / runtime
  ├─ generic Action Boundary / governance
  ├─ generic Web / iOS / Android SDKs
  ├─ generic Studio / commerce examples only
  └─ extraction regression gate

external Pegasus proof repository
  ├─ airline Experience composition
  ├─ airline components / adapters / actions
  ├─ airline fixtures and naming
  └─ cross-platform proof evidence
```

## Extracted from the core repository

- `examples/airline-brand-kit`
- `examples/flight-search-demo`
- `examples/mock-airline-domain`
- `examples/pegasus-chat-demo`
- root Pegasus/flight demo scripts and Pegasus demo verification hook

## Invariants

- `packages/`, `sdk/`, `examples/` and root package scripts may not contain Pegasus, airline or flight semantics.
- MASTER-23 does not add airline compatibility branches to resolver, runtime, governance, registry or native SDKs.
- The external proof must use one exact canonical Pack identity/version across Web, iOS and Android.
- The external proof must traverse the same generic resolver, Action Boundary and governance path as any other brand.
- The external proof must exercise stale-revision, duplicate-idempotency, wrong-version, unsigned-artifact, unknown-component and unknown-action negative cases.
- External proof evidence records the exact Vira stack head and Pack digest.
- RC1 remains blocked until that external proof exists and passes; the current connected GitHub capability cannot create a new repository and no dedicated Pegasus proof repository is presently available.

## Verification scope

Focused repository architecture coverage scans production packages, native SDK source, workspace examples and root package scripts and fails if forbidden airline-domain vocabulary is reintroduced. The external-proof acceptance checklist is versioned in-repo so MASTER-25 can verify evidence without moving airline implementation back into Vira core.
