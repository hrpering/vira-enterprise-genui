# EOBS-001 — Experience Observability v1

## Status

Reconciled onto authoritative `main` `fe40163c5d4af38b9486e6c2a5b1f063fd55a4a0`.

Branch: `feat/experience-observability-v1`.

## Ownership

Experience Observability is a thin semantic mapping layer over the existing canonical telemetry package. It does not introduce a second telemetry event schema, exporter, transport, persistence layer, or customer-content capture surface.

```text
experience occurrence
      ↓
fixed semantic mapping
      ↓
existing createTelemetryEvent()
      ↓
existing telemetry channel/exporter
```

## Boundary

`experience-observability -> telemetry` only.

## Invariants

- fixed event mapping only;
- existing telemetry validation/normalization remains authoritative;
- no arbitrary secret/customer-content payloads;
- no provider-specific exporter dependency;
- deterministic, bounded event fields;
- package boundary remains acyclic.

## Acceptance

1. contract mapping tests pass;
2. integration with the existing telemetry channel passes;
3. latest-main diff contains only EOBS owner files plus its single package-boundary declaration;
4. exact reconciled-head hosted CI and adversarial review pass;
5. local repository CI remains deferred to the final all-phase integration SHA.

## Merge rule

Do not merge independently. All Experience Platform phases will be assembled into one exact integration tree and the user will run the full local CI gate once before any merge.