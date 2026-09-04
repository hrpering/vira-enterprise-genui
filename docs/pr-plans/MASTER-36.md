# MASTER-36 — Design System / External Design Import

## Goal

Add a provider-neutral Canvas authoring import boundary for external design systems without turning Canvas into a Figma/Sketch parser, renderer installer or competing design-system owner.

## Base

- authoritative `main`: `70194c6415c7b66c5f2569733b6ed1aa88b59832`
- previous phase: MASTER-35 merged via PR #195
- branch: `master/36-design-system-external-import`
- frozen executable head: `2909dd596a54b6e6602b0ea38135cb2a243ef4e8`

## Ownership

Existing owners remain canonical:

- `design-system-compiler` owns DTCG 2025.10 token compilation.
- `studio-design` owns Studio design catalog options/controls.
- `studio-brand` owns full brand definitions including components/actions/data/policies/templates.
- `studio-brand-loader` owns trusted renderer activation.
- `application-canvas` owns Canvas draft/revision semantics.

MASTER-36 introduces `application-canvas-design-import` only for authoring-time import provenance + compilation binding.

It owns strict normalized DTCG import input, bounded source provenance, exact current Application `brandRef` binding, delegation to `compileDtcgDesignTokens()`, deterministic safe raw-source canonicalization, and the frozen authoring import artifact.

It does not own vendor payload parsing, URLs/tokens/credentials/provider bindings, renderer/component implementation installation, full brand package assembly, Canvas semantic mutation, publication/deployment/runtime, governance/authorization or Action/Capability execution.

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
- raw DTCG object keys are recursively sorted for deterministic artifact evidence;
- canonicalization uses null-prototype objects so prototype-sensitive keys remain inert data until the canonical compiler rejects them;
- import never mutates the caller draft or source.

## Q5 security review

PASS.

- root and source envelopes use shared safe JSON parsing and exact shapes;
- provider/URL/credential/apply/publish authority smuggling is rejected;
- source ids/revisions are bounded and control-character free;
- exact existing Application `brandRef` is mandatory; there is no implicit/latest brand;
- DTCG reference/extension/unsafe-name semantics continue to fail closed through the canonical compiler;
- deterministic canonicalization does not introduce prototype setters;
- output is deeply frozen authoring data only.

## Q6 architecture review

PASS.

Executable dependencies are only `application-canvas`, `design-system-compiler` and `protocol`. No Studio brand owner is duplicated and no renderer trust, runtime, deployment, governance, Action or network/provider authority is reachable.

Figma/Sketch/vendor adapters remain outside core and may only normalize to DTCG before this boundary.

## Q0–Q9

- Q0 PASS — exact base `70194c6415c7b66c5f2569733b6ed1aa88b59832`.
- Q1 PASS — targeted reverse engineering of compiler/design/brand/loader/Canvas owners.
- Q2 PASS — provider-neutral DTCG import boundary frozen.
- Q3 PASS — `application-canvas-design-import` implemented.
- Q4 PASS — focused import/brand/provenance/security/non-authority + deterministic/prototype hardening coverage implemented.
- Q5 PASS — security/fail-closed review.
- Q6 PASS — architecture/ownership review.
- Q7 REQUIRED — exact frozen-head local boundaries/typecheck/focused tests.
- Q8 PRE-Q7 PASS — actual executable scope reviewed; final post-Q7 executable-clean compare required.
- Q9 BLOCKED until Q7/final Q8; then squash merge and start MASTER-37 from new authoritative `main`.

Exact local Q7:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run tests/contract/application-canvas-design-import.test.ts tests/contract/application-canvas-design-import-hardening.test.ts
```

Hosted verify/iOS/Android jobs on the frozen executable head ended with `steps: null`; infrastructure non-signal only.
