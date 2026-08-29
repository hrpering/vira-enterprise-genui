# Vira Experience Studio — master plan

## Product goal

Vira Experience Studio lets an enterprise team design brand-native GenUI experiences without writing application code after the initial integration. Developers register safe brand components, data/action surfaces, and policies once; product/design/operations teams then compose approved experiences visually.

The Studio is an **optional authoring layer** above the existing Vira Enterprise GenUI core. It must not turn the core runtime into a page builder, workflow engine, or arbitrary-code platform.

## Non-negotiable architecture

```text
Enterprise developer integration
  brand components + actions + data + policies
                    |
                    v
          Experience Studio app
                    |
             Puck editor adapter
                    |
                    v
       editor-neutral StudioDocument
                    |
             Studio compiler
                    |
                    v
          StudioPublication
                    |
        narrow runtime bridge
                    |
                    v
   existing Vira runtime/security/actions
```

`Puck Data` is never a Vira public protocol. Puck is an embedded editor implementation detail. The canonical Studio artifact is `StudioDocument`, and the publish artifact is `StudioPublication`.

## Why Studio does not compile directly to ExperiencePlan

The existing Protocol intentionally defines `ExperiencePlan` as semantic planning data: intent, resolved state, and capability buckets. It deliberately excludes regions, layout, components, props, actions, bindings, and brand metadata.

Runtime Web similarly keeps its current RenderModel semantic and intentionally excludes component props and data bindings. A free-form visual authoring surface therefore cannot honestly be represented as the current ExperiencePlan without breaking package ownership.

Studio uses a parallel presentation/interaction artifact tied to an `ExperienceRecipe` identity. A later narrow bridge coordinates the published authored experience with the existing semantic planner/runtime path.

## Canonical Studio model

Studio v1 uses a flat, editor-neutral graph that can represent nested Puck slots without storing Puck-specific JSON:

- `views`: named experience states/screens;
- `nodes`: approved semantic component references;
- `parentId + slot + order`: deterministic visual hierarchy;
- `props`: canonical static JSON configuration only;
- `bindings`: explicit state/domain data-to-prop references;
- `interactions`: component event -> enterprise action-event mapping;
- `routes`: success/empty/error transitions between views.

No JavaScript functions, imports, URLs, endpoints, HTML, CSS, callbacks, or executable expressions are valid StudioDocument fields.

## Puck role

Target integration: `@puckeditor/core` 0.23.x, pinned to an exact version when introduced. Puck is MIT licensed and its Node >=20 requirement is compatible with this repository's Node >=24 baseline.

Puck owns editor mechanics only:

- canvas and drag/drop;
- nested slots;
- selection and outline;
- property editing shell;
- editor viewport behavior;
- undo/redo and editor ergonomics provided by Puck.

Vira owns:

- canonical StudioDocument schema;
- brand component catalog and capability constraints;
- action/data binding selectors;
- flow/state semantics;
- validation and publishing;
- security authorization;
- runtime bridge;
- AI-assisted generation constraints.

## Delivery stack

### Studio PR-073 — foundation contracts

- add `studio-schema` package;
- add editor-neutral StudioDocument v1;
- add bounded validation for views/nodes/bindings/interactions/routes;
- add `studio-compiler` package;
- compile to deterministic StudioPublication + dependency manifest;
- add package-boundary rules and contract tests;
- no Puck/React dependency yet.

### Studio PR-074 — brand component catalog

- define Studio-specific brand palette/catalog contract;
- map semantic component refs to editor metadata;
- declare allowed slots and editable prop descriptors;
- keep executable React components outside serializable contracts;
- validate document component refs against the catalog.

### Studio PR-075 — Puck adapter

- add exact pinned `@puckeditor/core` dependency;
- translate Puck Data -> StudioDocument and StudioDocument -> Puck Data where lossless;
- keep Puck IDs/config out of public Studio contracts;
- add migration/version boundary for Puck data changes.

### Studio PR-076 — Experience Studio application shell

- add `apps/experience-studio` workspace;
- embed Puck with Vira-owned chrome;
- load one brand catalog and one StudioDocument;
- save draft locally/in injected persistence port;
- no auth/billing/backend platform.

### Studio PR-077 — component composition MVP

- brand palette in left rail;
- nested layout/slot composition;
- safe property panel;
- delete/duplicate/reorder constraints;
- desktop/tablet/mobile preview modes;
- no arbitrary HTML/JS/custom iframe.

### Studio PR-078 — data binding MVP

- explicit state/domain binding selector;
- no expression language, eval, JSONPath, or arbitrary transforms;
- binding compatibility metadata per prop;
- preview fixtures and fail-closed missing bindings.

### Studio PR-079 — actions and flow

- bind component events to registered Action Adapter events;
- success/empty/error view routes;
- view/state navigator;
- deterministic transition validation;
- no loops, timers, background jobs, or general workflow engine.

### Studio PR-080 — preview and publish

- compile draft -> StudioPublication;
- publish gate validates component/action/data references;
- immutable/versioned publication artifact;
- live preview uses the same registered brand component implementations planned for production;
- draft and publish remain separate states.

### Studio PR-081 — runtime bridge

- add the smallest integration seam required to execute StudioPublication with existing Runtime Core action/permission/security semantics;
- do not widen ExperiencePlan with presentation fields;
- do not bypass capability/component/action allowlists;
- bridge must remain optional so existing runtime consumers are unchanged.

### Studio PR-082 — AI-assisted authoring

- prompt -> candidate StudioDocument only;
- constrain generation to current brand catalog/actions/binding sources;
- validate before opening in canvas;
- human preview/approval before publish;
- no generated JavaScript/CSS/endpoints.

### Studio PR-083 — enterprise golden gate

- Pegasus-style flight discovery golden experience;
- multi-view flow, nested components, data bindings, action routing;
- denial tests for unregistered component/action/binding;
- Puck round-trip/adaptation test;
- publication determinism and runtime security integration.

## MVP cut line

The first sellable Studio MVP stops after PR-081:

- visual component composition;
- brand-native component catalog;
- safe prop editing;
- explicit data binding;
- action binding;
- success/empty/error flow;
- preview;
- draft/publish;
- runtime bridge.

AI authoring is valuable but not required to prove the no-code product.

## Explicit non-goals for MVP

- Figma/Webflow-level free drawing;
- arbitrary CSS or HTML editing;
- arbitrary JavaScript;
- arbitrary API builder;
- general n8n-style workflow orchestration;
- loops and background tasks;
- custom code nodes;
- multi-user collaboration/presence;
- CMS/version-control platform;
- authentication/billing platform.

## Parallel-work rule

Studio branches stack on the current canonical core head but Studio packages do not modify Planner, Composer, Runtime Core, Runtime Web, Security, or Protocol internals during the independent authoring phases.

If Studio discovers a missing core capability, that change is proposed as a separate narrow core PR. The Studio stack then consumes the public contract after it exists.

This preserves two independently reviewable tracks:

```text
CORE TRACK                         STUDIO TRACK
Protocol                           Studio Schema
Planner                            Studio Compiler
Composer                           Brand Catalog
Adapter SDK                        Puck Adapter
Runtime Core                       Studio App
Runtime Web                        Bindings / Flow / Publish
Security                           Runtime Bridge
       \                              /
        +---- public contracts ------+
```
