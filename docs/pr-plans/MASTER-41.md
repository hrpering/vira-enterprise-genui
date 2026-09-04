# MASTER-41 — Federated Distribution

## Goal

Add a provider-neutral Application federation snapshot/discovery contract over canonical Distribution envelopes without introducing transport, registry persistence, source authentication, ranking, latest resolution or execution authority.

## Base

- authoritative `main`: `b425e5e7104c1a6441671301a6ac262e4e15e1bb`
- previous phase: MASTER-40 merged via PR #200
- branch: `master/41-federated-distribution`
- PR: #201
- frozen executable head: `8f488959478368c1b7887c39af30808c127f5a8a`

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

Public federation admits only releases whose canonical Application metadata says:

```text
visibility = "public"
discoverable = true
```

This is a metadata admission rule, not source authentication, publisher proof or an access-control decision.

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
- public/discoverable admission is not authentication or access-control proof;
- no URL/endpoint/transport/provider/credential fields;
- no persistence/registry server/ranking/recommendation;
- no deployment/runtime/governance/authorization/entitlement;
- no protocol adapter, Capability or protected Action execution.

## Dependency boundary

```text
application-federation → application-distribution, protocol
```

## Q5 security / fail-closed review

PASS. See `docs/evidence/MASTER-41/REVIEW.md`.

- shared safe JSON boundary before federation logic;
- explicit source/per-source/total-release bounds;
- exact root/source/query shapes reject authority-smuggling fields;
- unsafe accessors/custom prototypes fail closed;
- exact release lookup only; no implicit latest or source priority;
- divergent exact releases fail closed instead of selecting a winner.

## Q6 architecture / ownership review

PASS.

`application-federation` depends only on `application-distribution` and `protocol`. Experience registry, enterprise/private registry, AI-host SDK, transport, projection adapters, deployment/runtime, governance/authorization/entitlement and execution owners remain unchanged.

## Focused verification

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/application-federation.test.ts \
  tests/contract/application-federation-hardening.test.ts
```

Q7 exact frozen-head local verification is operator-reported PASS and recorded in `docs/evidence/MASTER-41/Q7_LOCAL.md`.

## Final Q8

Independent PR reverse engineering verdict: **PASS**. See `docs/evidence/MASTER-41/Q8_REVIEW.md`.

Frozen executable `8f488959478368c1b7887c39af30808c127f5a8a` to evidence closure is documentation/evidence-only; executable drift is zero. A final closure-head compare is required immediately before squash merge.

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main.
- Q1 PASS — targeted registry/distribution owner reverse engineering.
- Q2 PASS — federation/non-authority contract frozen.
- Q3 PASS — implementation added.
- Q4 PASS — focused conflict/public-leakage/hardening coverage added.
- Q5 PASS — final security/fail-closed review.
- Q6 PASS — architecture/ownership review.
- Q7 PASS — operator-reported exact frozen-head local boundaries/typecheck/focused tests.
- Q8 PASS — independent PR reverse engineering + executable-clean closure compare.
- Q9 READY — final exact-head squash merge, then record new authoritative main and start MASTER-42 from it.

Hosted verify/iOS/Android jobs on the frozen executable head ended without executable steps and remain infrastructure non-signal.
