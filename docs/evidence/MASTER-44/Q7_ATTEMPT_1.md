# MASTER-44 — Q7 Local Attempt 1

**Date:** 2026-09-05  
**Frozen executable SHA:** `52dfb067904b34ffe055431232ed8e621a3b3d6f`  
**Result:** FAIL — executable typecheck defect found; this freeze is invalidated for final Q7 evidence.

## Exact-head verification

Operator reran the gate detached at:

```text
52dfb067904b34ffe055431232ed8e621a3b3d6f
```

## Commands

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/hosted-capability-runtime.test.ts \
  tests/contract/hosted-capability-runtime-hardening.test.ts
```

## Reported results

### Package boundaries

PASS.

```text
Package boundary check passed.
```

### Typecheck

FAIL with one TypeScript error:

```text
packages/hosted-capability-runtime/src/runtime.ts:132:52 - error TS7053:
Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'JsonArray | JsonObject'.

132   for (const key of Object.keys(value)) freezeJson(value[key]!);
```

`pnpm typecheck` exited with code 2.

### Focused MASTER-44 tests

PASS.

```text
Test Files  2 passed (2)
Tests       22 passed (22)
```

The operator supplied a second exact-head rerun with the same outcome: boundaries PASS, the same TS7053 typecheck failure, and 22/22 focused tests PASS.

## Root cause

The shared protocol type is:

```ts
type JsonArray = readonly JsonValue[];
type JsonObject = { readonly [key: string]: JsonValue };
type JsonValue = JsonPrimitive | JsonArray | JsonObject;
```

`freezeJson()` used the built-in `Array.isArray(value)` branch, but TypeScript did not narrow the readonly `JsonArray | JsonObject` union sufficiently for string indexing in the object branch.

This is a real executable compile/typecheck defect even though runtime-focused tests pass.

## Remediation rule

- Do not alter the shared protocol JSON contract.
- Add a local explicit `JsonArray` type guard and use it in `freezeJson()` so the non-array object branch is statically `JsonObject`.
- No runtime/query/provider/authority semantics change.
- Because executable code changes, create a **new frozen executable SHA** and rerun the full Q7 command set on that exact SHA.
- This failed attempt must never be reused as final Q7 PASS evidence.
