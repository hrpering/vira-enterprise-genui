# MASTER-36 — Design System / External Design Import

## Goal

Add a provider-neutral Canvas authoring import boundary for external design systems without turning Canvas into a Figma/Sketch parser, renderer installer or competing design-system owner.

## Base

- authoritative `main`: `70194c6415c7b66c5f2569733b6ed1aa88b59832`
- previous phase: MASTER-35 merged via PR #195
- branch: `master/36-design-system-external-import`

## Ownership

Existing owners remain canonical:

- `design-system-compiler` owns DTCG 2025.10 token compilation.
- `studio-design` owns Studio design catalog options/controls.
- `studio-brand` owns full brand definitions including components/actions/data/policies/templates.
- `studio-brand-loader` owns trusted renderer activation.
- `application-canvas` owns Canvas draft/revision semantics.

MASTER-36 introduces `application-canvas-design-import` only for authoring-time import provenance + compilation binding.

It owns:

- strict external design import input shape;
- normalized DTCG source format requirement;
- bounded source id/revision provenance;
- exact current Application `brandRef` requirement;
- delegation to `compileDtcgDesignTokens()`;
- frozen authoring import artifact carrying source + compiled Studio design options.

It does not own:

- Figma/Sketch/vendor payload parsing;
- URLs, tokens, credentials or provider bindings;
- renderer/component implementation installation;
- full brand package assembly;
- Canvas semantic mutation/application;
- publication/deployment/runtime;
- governance/authorization;
- Action/Capability execution.

## Import flow

```text
external connector / adapter
        ↓
normalize vendor format → DTCG 2025.10
        ↓
Canvas draft + exact Application brandRef
        ↓
application-canvas-design-import
        ↓
existing design-system-compiler
        ↓
frozen authoring-import artifact
        ↓
human/host-controlled downstream brand workflow
```

## Failure semantics

- malformed or unsafe input fails closed through shared JSON parsing;
- missing exact Application brandRef fails closed;
- vendor-specific or unsupported format fails closed;
- unknown source fields such as provider/url/credential/apply/publish fail closed;
- compiler failures are forwarded with source-document path + compiler code;
- sources with no supported literal color/font tokens fail closed;
- import never mutates the caller draft or source.

## Q0–Q9

- Q0 PASS — exact base `70194c6415c7b66c5f2569733b6ed1aa88b59832`.
- Q1 PASS — targeted reverse engineering of compiler/design/brand/loader/Canvas owners.
- Q2 PASS — provider-neutral DTCG import boundary frozen.
- Q3 PASS — `application-canvas-design-import` implemented.
- Q4 PASS — focused import/brand/provenance/security/non-authority coverage implemented.
- Q5 REQUIRED — security/fail-closed review.
- Q6 REQUIRED — architecture/ownership review.
- Q7 REQUIRED — exact-head local boundaries/typecheck/focused tests.
- Q8 REQUIRED — actual PR diff review and final executable-clean compare.
- Q9 BLOCKED until Q7/Q8; then squash merge and start MASTER-37 from new authoritative `main`.

Exact local Q7 target:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run tests/contract/application-canvas-design-import.test.ts
```
