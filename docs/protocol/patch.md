# Patch Protocol v1

Patch is an ordered, data-only description of requested document changes. It is validated by the protocol package and later interpreted by the runtime patch engine.

## Contract

```ts
interface Patch {
  version: "1";
  operations: PatchOperation[];
}

type PatchOperation =
  | { op: "set"; path: string; value: JsonValue }
  | { op: "remove"; path: string }
  | { op: "merge"; path: string; value: JsonObject }
  | { op: "append"; path: string; value: JsonValue }
  | { op: "replace"; path: string; value: JsonValue };
```

## Operation semantics

Protocol validation defines shape only. The runtime engine later enforces target-document semantics:

- `set`: create or overwrite a value at a path.
- `remove`: remove an existing value.
- `merge`: shallow/declarative object merge at an object target.
- `append`: append one value to an array target.
- `replace`: replace an existing value.

## Path rules

Paths use a constrained JSON Pointer-style syntax:

- non-empty and begin with `/`;
- segments are non-empty;
- `~0` decodes to `~` and `~1` decodes to `/`;
- malformed `~` escapes are rejected;
- control characters are rejected;
- decoded segments named `__proto__`, `prototype`, or `constructor` are rejected;
- maximum path length is 1024 characters.

The protocol does not execute paths or mutate objects.

## Value rules

Patch values are canonical JSON and are cloned during normalization. Object keys named `__proto__`, `prototype`, or `constructor` are rejected recursively so value payloads cannot become a prototype-pollution carrier when later consumed by the patch engine. `merge` additionally requires an object value.

## Boundary

Patch v1 has no callbacks, JavaScript, expressions, endpoint calls, tool invocations, DOM operations, permission bypasses, or network behavior. Permission and target-state validation belong to runtime-core.
