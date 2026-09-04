# Vira Application Model

## Purpose

This document freezes the semantic meaning of **Application** for the Vira Application Network. MASTER-26 is a documentation-only semantic freeze: it does not introduce an executable Application schema, package, runtime, resolver or deployment authority.

## Definition

A Vira Application is a **higher-order, versioned semantic composition** that references existing canonical identities without replacing their owners.

Conceptually:

```text
Vira Application
    ├── Experience references
    ├── Capability references
    ├── Context relationships
    ├── governed Action relationships
    └── application-semantic graph/composition
```

An Application describes how governed product functionality is composed. It does not become the implementation owner of the referenced functionality.

## Canonical relationship to existing Experience semantics

The existing Experience path remains authoritative:

```text
StudioExperienceDocument
        ↓
StudioPublication
        ↓
Experience Pack
        ↓
registry / deployment / resolver
        ↓
runtime + Web / iOS / Android hosts
```

Application semantics sit **above** that path:

```text
Application release
      ↓ exact references
Experience / Pack / Capability / Context / Action semantics
      ↓
existing canonical owners
```

An Application must not copy a `StudioExperienceDocument`, redefine an Experience Pack manifest, duplicate an Action contract, embed provider-specific execution authority or fork platform semantics.

## `ViraApplicationPackage`

`ViraApplicationPackage` is the planned immutable distribution unit for an Application release.

MASTER-26 freezes only these semantic requirements:

- one exact Application identity and release version;
- an application-semantic composition/graph;
- exact references to canonical dependency identities used for execution;
- provenance/integrity sufficient to bind a resolved release to the reviewed artifact;
- no implicit-latest execution;
- no hidden provider/customer semantics in generic core.

Field-level schema, package implementation and persistence are intentionally deferred to a later implementation phase.

## `ApplicationGraph`

`ApplicationGraph` owns **application-semantic relationships**, not editor projection state.

It may express relationships such as:

- an Experience exposing a human interaction surface;
- a Capability supplying provider-neutral functionality;
- Context flowing between bounded application steps;
- an Action relationship crossing governance and the Action Boundary;
- semantic transitions between application surfaces or functions.

It does not own:

- Canvas x/y coordinates, zoom, selection, panels or editor history;
- runtime state or runtime revision;
- deployment revision;
- provider credentials or provider-specific transport state;
- chat history or user memory;
- platform-specific render trees.

Canvas may project/edit an `ApplicationGraph`; Canvas projection is not the graph itself.

## Five semantic families

The Application Network composes five families with distinct owners:

1. **Experience** — governed human-facing UI semantics.
2. **Capability** — provider-neutral invocable functionality.
3. **Context** — bounded work state, artifacts, evidence, results, decisions, receipts and provenance.
4. **Action** — governed effects behind existing governance and Action Boundary owners.
5. **Application** — higher-order composition that references the other families.

Application is therefore not a sixth execution engine around them. It is the composition/distribution semantic layer.

## Application vs adjacent nouns

| Noun | Meaning | Not the same as Application |
|---|---|---|
| Experience | one governed human-facing experience | may be one surface inside an Application |
| StudioPublication | compiled canonical Studio publication | compile artifact, not application composition |
| Experience Pack | immutable/versioned Experience distribution artifact | dependency of an Application, not the Application itself |
| Deployment | environment placement of an exact artifact | operational state, not semantic application identity |
| Runtime instance | one mounted/executing instance with revisions/lifecycle | ephemeral execution, not release identity |
| Canvas | authoring/proposal UI | projection/editor, not semantic authority |
| Network | discovery/distribution | distribution authority, not execution authority |
| Provider | implementation supplying a capability/backend | binding, not canonical semantic owner |

## Cross-platform invariant

Application semantics are platform-neutral. Web, iOS and Android consume equivalent resolved semantics; platform adapters may adapt presentation but may not fork Application meaning, dependency identity, protected Action meaning or Context semantics.

## Composition invariants

A valid future Application implementation must preserve:

- exact identity/version resolution before execution;
- immutable published release semantics;
- one canonical owner per semantic family;
- explicit provider binding rather than provider-owned semantics;
- explicit loss/failure when a dependency cannot be represented or resolved;
- no silent drop/substitution of required Experience, Capability, Context or Action semantics;
- no Canvas/Network bypass of governance or Action Boundary;
- no platform-specific fork of the canonical Application graph.

## Non-goals

Application is not a generic workflow engine, agent framework, prompt graph, IDE project format, arbitrary code bundle, policy language, cloud job definition or chat transcript.

Those systems may integrate with Vira, but they do not define Vira Application semantics.
