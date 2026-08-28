# Protocol versioning and compatibility

Vira Enterprise GenUI protocols are independently versioned data contracts. Each owning protocol exports its own version constant; the central version registry only provides an immutable view of those constants.

## Current protocol kinds

- `intent`
- `domain-data`
- `capability`
- `experience-plan`
- `patch`

All currently support version `"1"` only.

## Compatibility rules

1. **Exact string match only.** `"1"` is supported; `1`, `"01"`, and `"2"` are not silently coerced.
2. **No implicit upgrade or downgrade.** A parser either understands the declared version or returns an unsupported-version validation result through its owning parser.
3. **No silent forward compatibility.** v1 parsers reject unknown top-level fields. A wire-shape change that older v1 parsers cannot safely understand requires a new protocol version.
4. **Version ownership stays local.** Intent owns `INTENT_PROTOCOL_VERSION`, Patch owns `PATCH_PROTOCOL_VERSION`, and so on. The registry imports those constants rather than redefining them.
5. **Protocol version is not package version.** npm/package releases may change without changing a protocol wire version when behavior remains contract-compatible.
6. **Migration is explicit.** If a future v2 requires transformation from v1, that migration must be implemented and tested as a separate concern. The version registry does not transform data.

## Pre-release note

Before the first public protocol release, a draft PR may still be amended during review. Once a protocol version is released, its accepted wire contract should be treated as immutable; incompatible shape changes require a new version.

## Boundary

This module does not negotiate with servers, call networks, select adapters, migrate payloads, or infer compatibility from semver. It reports only what this local build explicitly supports.
