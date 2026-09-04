# MASTER-41 — Federated Distribution

## Goal

Add a provider-neutral Application federation snapshot/discovery contract over canonical Distribution envelopes without introducing transport, registry persistence, source authentication, ranking, latest resolution or execution authority.

## Base

- authoritative `main`: `b425e5e7104c1a6441671301a6ac262e4e15e1bb`
- previous phase: MASTER-40 merged via PR #200
- branch: `master/41-federated-distribution`

## Contract

```text
FederationSnapshot {
  schemaVersion: "1",
  sources: [{
    sourceId,
    applications: ViraApplicationDistributionEnvelope[]
  }]
}
```

Public federation accepts only releases whose canonical Application metadata says:

```text
visibility = "public"
discoverable = true
```

Exact lookup:

```text
lookupViraFederatedApplication(snapshot, {
  applicationId,
  applicationVersion
})
```

No floating/latest alias is accepted.

## Conflict semantics

- duplicate source IDs fail closed;
- duplicate exact releases within one source fail closed;
- the same exact `id@version` across sources is allowed only when canonical Distribution serialization is identical;
- disagreement on the same exact release fails the snapshot with `FEDERATION_CONFLICT`;
- no priority, majority vote, timestamp or fallback chooses a winner.

## Trust / non-authority rules

- `sourceId` is host-asserted provenance, not authenticated identity;
- federation parsing does not verify Distribution digests or claim trust;
- no URL/endpoint/transport/provider/credential fields;
- no persistence/registry server/ranking/recommendation;
- no deployment/runtime/governance/authorization/entitlement;
- no protocol adapter, Capability or protected Action execution.

## Dependency boundary

```text
application-federation → application-distribution, protocol
```

## Focused verification

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/application-federation.test.ts \
  tests/contract/application-federation-hardening.test.ts
```

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main.
- Q1 PASS — targeted registry/distribution owner reverse engineering.
- Q2 PASS — federation/non-authority contract frozen.
- Q3 PASS — implementation added.
- Q4 PASS — focused conflict/public-leakage/hardening coverage added.
- Q5 REQUIRED — final security/fail-closed review.
- Q6 REQUIRED — architecture/ownership review.
- Q7 REQUIRED — exact-head local boundaries/typecheck/focused tests.
- Q8 REQUIRED — final actual-diff + post-Q7 executable-clean compare.
- Q9 BLOCKED until Q7/Q8; then MASTER-42 starts from resulting authoritative main.
