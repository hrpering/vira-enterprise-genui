# Design System Compiler v1

The Design System Compiler imports a strict, deterministic subset of the stable DTCG 2025.10 token format and compiles it into the existing `StudioDesignCatalogOptions` contract.

It is an import boundary, not a second Vira design model.

```text
DTCG 2025.10 source
        ↓
design-system-compiler
        ↓
StudioDesignCatalogOptions
        ↓
existing createStudioDesignCatalog()
        ↓
existing Studio authoring/runtime design path
```

## Supported v1 semantics

Compiler v1 supports literal:

- `color` tokens;
- `fontFamily` tokens;
- group `$type` inheritance;
- token-level `$type` override;
- group `$root` tokens;
- deterministic lexicographic traversal.

Unsupported token types are ignored and counted in compile metadata. The compiler fails if the source contains no supported tokens.

### Colors

The current Studio design contract accepts opaque `#RRGGBB` values only. Therefore the compiler:

- converts fully numeric `srgb` components in `[0, 1]` to uppercase `#RRGGBB`;
- checks an sRGB `hex` fallback for consistency when both representations are present;
- accepts other DTCG color spaces only when an opaque six-digit `hex` fallback is present;
- rejects alpha values other than `1`;
- rejects unsupported spaces without an exact fallback instead of approximating them.

### Font families

DTCG `fontFamily` string values compile to one Studio font entry. Arrays compile to an ordered comma-separated fallback stack. Every family name is validated against a deliberately narrow grammar and the final stack must fit the existing Studio 128-character registered-font limit.

The compiler does not accept URLs, CSS declarations, functions, quotes, control characters, or reference expressions as font names.

## Fail-closed boundary

Compiler v1 does not resolve:

- curly-brace aliases;
- JSON Pointer `$ref` references;
- `$extends` inheritance;
- reference cycles;
- provider-specific token extensions;
- remote resources;
- arbitrary CSS or executable content.

Unsupported reference semantics fail explicitly. Unknown DTCG reserved `$...` fields fail closed.

Input traversal is bounded by depth, node and token budgets. Output palette/font counts use the limits already owned by `@vira-enterprise-genui/studio-design`.

## Dependency boundary

`@vira-enterprise-genui/design-system-compiler` depends only on `@vira-enterprise-genui/studio-design`.

It has no dependency on Puck, React, runtime packages, Experience Packs, registries, network clients, filesystem APIs, Figma, Tokens Studio, or Style Dictionary.

Style Dictionary may later be introduced as an optional source-normalization adapter. It must never become Vira's canonical design contract.
