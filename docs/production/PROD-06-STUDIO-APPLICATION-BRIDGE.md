# PROD-06 — Studio → Canonical Application V2 bridge authority note

## Decision

`integrations/studio-application-bridge` is a thin composition adapter, not a new semantic owner.

The nearest canonical owners are:

- Studio document semantics: `studio-schema`
- Studio publication gate: `studio-publish`
- Action event → action type mapping: `adapter-sdk`
- Experience Pack semantics: `experience-packs`
- Application release/reference semantics: `application-package`
- Production deployment/activation: `deployment-plane`

The PROD-06 bridge must connect these authorities without copying or weakening them. A separate canonical package owner would be incorrect because the bridge has no independent Studio, Pack, Application, deployment, governance, or execution semantics.

## Allowed dependency direction

```text
Studio draft
  ↓
studio-publish                 canonical Studio validation/publication
  ↓
Action Adapter                 registered event → Action identity
  ↓
integrations/studio-application-bridge
  ├─ Experience Pack candidate → experience-packs parser
  └─ Application V2 candidate  → application-package parser
```

The bridge uses public canonical APIs. It does not modify `studio-publish`.

## Invariants

1. Invalid Studio input cannot produce an Application candidate.
2. Every Studio `actionEvent` must resolve through the canonical Action Adapter.
3. Every mapped Action identity used by Studio must be declared by the Application with an exact `id + versionRef`.
4. Floating Action references are rejected by the canonical Application V2 parser.
5. The Studio publication is serialized into a concrete UTF-8 `application/json` artifact with SHA-256 digest and exact byte size.
6. The Experience Pack contains that exact Studio publication artifact as an entrypoint and is accepted by the canonical Experience Pack parser.
7. The Application Experience reference points to that exact Pack version and entrypoint.
8. Pack publisher namespace rules remain owned by `experience-packs` and fail closed.
9. Repeating the same input produces the same publication bytes, digest, Pack, and Application artifact.
10. Bridge success grants no deployment, activation, governance, entitlement, or execution authority.

## Explicit non-ownership

The bridge does **not** own or perform:

- Studio schema/binding/design/flow validation;
- Experience Pack schema rules;
- Application V2 validation or exact-reference rules;
- publisher authentication, signing, registry upload, distribution trust, or provenance;
- staging/production deployment, promotion, rollback, or activation;
- provider binding, governance, protected Action execution, or commercial authorization.

Those remain with their existing canonical owners and later production phases.

## Focused executable proof

`tests/contract/studio-application-bridge.test.ts` proves:

- deterministic exact Studio artifact → Pack → Application V2 creation;
- Studio event alias → canonical Action Adapter → exact Application Action binding;
- missing exact Action reference fails closed;
- floating Action version rejection is delegated to `application-package`;
- Pack namespace/publisher rejection is delegated to `experience-packs`;
- invalid Studio flow is rejected before bridge output by `studio-publish`.

Root gate: `pnpm verify:studio-application-bridge`.
