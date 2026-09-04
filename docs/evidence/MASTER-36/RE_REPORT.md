# MASTER-36 Reverse-Engineering Report

## Base

Authoritative `main`: `70194c6415c7b66c5f2569733b6ed1aa88b59832`.

## Sources inspected

- `packages/design-system-compiler/src/types.ts`
- `packages/design-system-compiler/src/compiler.ts`
- `packages/design-system-compiler/src/internal.ts`
- `packages/studio-design/src/types.ts`
- `packages/studio-brand/src/types.ts`
- `packages/studio-brand/src/definition.ts`
- `packages/studio-brand-loader/src/types.ts`
- `packages/external-brand-sdk/src/types.ts`
- `packages/application-canvas/src/types.ts`
- `tooling/package-boundaries.config.mjs`

## Findings

1. `design-system-compiler` already owns normalized DTCG 2025.10 token compilation into `StudioDesignCatalogOptions`, including bounds, color/font validation, deterministic ordering and fail-closed reference/extension behavior.
2. `studio-design` owns Studio design catalog controls/options. MASTER-36 must consume compiled options rather than invent a parallel token/design schema.
3. `studio-brand` already consumes raw DTCG design tokens while assembling a full brand definition with component implementations, actions, data sources, policies and templates. Canvas design import must not duplicate that full brand owner.
4. `studio-brand-loader` owns activation against trusted renderer registries. External design import must not install or trust renderer implementations.
5. `external-brand-sdk` is a host/runtime consumption surface for experiences, not a design-token ingestion contract.
6. Application semantics already carry an exact `brandRef`. External design import should bind to that existing exact reference rather than inventing an implicit/latest brand.
7. Vendor-specific Figma/Sketch/API payloads, URLs and credentials are transport/adapter concerns. Core should accept provider-neutral normalized DTCG only.
8. Canvas editor projection is unrelated to imported design semantics. Projection-only changes may alter `expectedRevision` but must not alter compiler output.

## Frozen implementation direction

Create `@vira-enterprise-genui/application-canvas-design-import` with dependencies only on:

- `application-canvas`
- `design-system-compiler`
- `protocol`

Input:

```text
{
  draft,
  source: {
    format: "dtcg-2025.10",
    sourceId,
    revision,
    document
  }
}
```

Output is a frozen `mode: "authoring-import"` artifact containing exact Canvas draft/revision binding, the current exact Application `brandRef`, source provenance/raw safe DTCG and the canonical compiler output.

There is no apply/publish/deploy/execute/renderer installation authority. A future adapter may normalize Figma/Sketch/etc. to DTCG before calling this boundary, but provider-specific formats do not become canonical Vira semantics.
