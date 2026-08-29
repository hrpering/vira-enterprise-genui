# Vira Experience Studio — architecture and current surface

## Product boundary

Experience Studio is the optional human authoring layer for Vira Enterprise GenUI. Enterprise developers register trusted brand components, approved data sources, action aliases and policies; product/design teams then compose brand-native experiences visually.

The Studio does not turn Runtime Core into a page builder or workflow engine. It produces editor-neutral artifacts that are validated before entering the existing runtime/action/security boundaries.

## Canonical path

```text
Enterprise integration
brand components + approved data/actions
                    |
                    v
          Human Studio Workbench
          Puck canvas + Vira panels
                    |
                    v
             StudioDocument
                    |
         binding / flow / design gates
                    |
                    v
           StudioPublication
                    |
             Studio Runtime
                    |
        Studio Runtime React / host
                    |
                    v
       existing Vira runtime/security
```

Puck Data is never a Vira public protocol. Puck is replaceable editor infrastructure. `StudioDocument` is the canonical editable artifact and `StudioPublication` is the validated publish artifact.

## Human authoring surface

Puck provides editor mechanics:

- Components palette and drag/drop;
- Layers/outline and nesting;
- component property editing;
- safe visual design controls;
- editor ergonomics and selection state.

Vira provides product semantics:

- Views/screens;
- approved Data bindings;
- approved Actions;
- success/empty/error routes;
- canonical node identity reconciliation;
- preview/publish validation;
- runtime bridge and production React rendering.

A host can therefore let a product/design team freely arrange the approved Lego pieces without exposing arbitrary executable code or unrestricted network behavior.

## Package map

- `studio-schema` — editor-neutral StudioDocument contracts and limits.
- `studio-catalog` — trusted brand component vocabulary.
- `studio-puck-adapter` — Puck metadata/data conversion boundary.
- `studio-puck-authoring` — canonical Puck reconciliation and node identity mapping.
- `studio-design` — bounded serializable visual design vocabulary.
- `studio-design-react` — shared React resolution of validated design values.
- `studio-binding` — approved state/domain data-to-prop bindings.
- `studio-flow` — approved component event/action aliases and outcome routes.
- `studio-compiler` — deterministic StudioPublication compilation.
- `studio-publish` — shared preview/publish validation gate.
- `studio-workbench` — editor-neutral human authoring commands.
- `studio-workbench-react` — Puck workbench with Views/Data/Actions panels.
- `studio-runtime` — published Studio interaction bridge into Runtime Web/Core.
- `studio-runtime-react` — Puck-free production React rendering.
- `studio-ai` — optional host-provider AI draft generation constrained to the active authoring vocabulary.

## Security boundary

Studio does not author or publish:

- arbitrary JavaScript, JSX or executable expressions;
- arbitrary HTML;
- raw CSS or unrestricted style objects;
- arbitrary URLs/API calls;
- unregistered components;
- unregistered binding sources;
- unregistered action aliases;
- permission bypasses.

Visual design values use a bounded grammar. Runtime action execution remains owned by the existing Runtime Web/Core permission path.

## Closure gates

The current implementation is covered by independent gates rather than one misleading “everything is complete” fixture:

1. contract tests for schema/catalog/Puck/binding/flow/design/publish/AI surfaces;
2. programmatic cross-package golden integration;
3. human Workbench integration test;
4. editor/production React design parity test;
5. Studio runtime bridge integration test;
6. required-prop Puck insertion regression test;
7. runnable browser Experience Studio demo;
8. repository-wide `pnpm verify` as the final merge/release gate.

## Current MVP cut

The sellable Studio MVP includes:

- registered brand component palette;
- nested visual composition;
- safe property and style editing;
- multiple screens/views;
- explicit data binding;
- action binding;
- success/empty/error routing;
- preview and publish validation;
- Puck-free production React rendering;
- runtime action/permission bridge;
- optional bounded AI draft generation;
- runnable human authoring example.

## Future work, not current merge blockers

- persistent draft/publication storage;
- authentication and enterprise approval workflows;
- multi-user collaboration/presence;
- visual graph/flow-map convenience UI;
- richer responsive/breakpoint authoring;
- asset management and registered media sources;
- provider-specific AI integrations and model configuration;
- deployment/version promotion workflows.

These can be layered around the existing contracts without moving Puck into the production runtime or widening the arbitrary-code boundary.
