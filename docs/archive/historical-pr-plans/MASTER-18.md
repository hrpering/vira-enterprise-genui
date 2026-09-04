# MASTER-18 — Cross-platform Conformance Suite

## Responsibility

Prove that one canonical Experience preserves equivalent semantics across Web, iOS and Android while allowing platform-native presentation differences.

```text
ONE FIXTURE
    │
    ├── Web runner
    ├── iOS runner
    └── Android runner
          │
          ▼
canonical semantic snapshots
          │
          ▼
conformance report
```

This is not screenshot testing.

## Required dimensions

Every peer snapshot is compared for:

```text
component semantics
state
bindings
actions
navigation
policy calls
accessibility metadata
canonical ActionIntent payload/identity
state revision
outcome
```

## Invariants

1. One fixture definition is applied to all three peer platforms.
2. Exactly one Web, one iOS and one Android runner are required; no platform fallback exists.
3. Runner input order is irrelevant; execution order is deterministic `web → ios → android`.
4. Web is only the deterministic comparison baseline; it is not the rendering authority for native platforms.
5. Native visual/layout differences are allowed when canonical semantic snapshots remain equivalent.
6. Screenshot equality is explicitly insufficient and is not part of the semantic comparator.
7. Component semantic identities must match across peers.
8. Canonical state and binding projections must match structurally; JSON object property ordering is irrelevant.
9. Action/event semantics and navigation history must match.
10. Governance/policy call semantics must match.
11. Accessibility node metadata is a first-class conformance dimension, not deferred to screenshots.
12. The same user interaction, such as `select-flight`, must yield an equivalent canonical ActionIntent on Web, iOS and Android.
13. ActionIntent validation remains MASTER-08 authority; MASTER-18 compares canonical host-produced ActionIntent snapshots and does not create a second ActionIntent parser.
14. State revision and outcome must match across peers.
15. A mismatch produces a dimension-specific report for the divergent peer; it never falls back to another platform.
16. The suite adds no runtime, renderer, protocol, policy engine or publication format.
17. Real host runners may be supplied by browser, iOS Simulator/test host and Android Emulator/test host integration harnesses at final CI.

## RE/QC findings closed

- existing platform Host/runtime authorities already own rendering and interaction execution, so conformance is a separate comparison/harness package rather than another runtime;
- Action Boundary exports the canonical ActionIntent type but no independent parser; the suite therefore compares host-produced canonical snapshots instead of forking ActionIntent validation;
- one-fixture execution is explicit through a peer-runner API and is canonicalized to Web/iOS/Android order;
- semantic JSON comparison is structural so cross-platform object key ordering cannot create false drift;
- presentation differences are intentionally excluded while accessibility semantics remain included;
- divergent platform output is reported by exact semantic dimension instead of hidden through fallback.

## Verification policy

Hosted CI remains deferred. Final local/full CI must execute the same fixture corpus through the Web host/browser harness, iOS Simulator/test host and Android Emulator/test host and assert component semantics, state, bindings, actions, navigation, governance calls, accessibility metadata, ActionIntent, revision and outcome parity.
