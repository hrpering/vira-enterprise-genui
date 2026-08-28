# Dependency rules

Dependencies must point toward stable semantic contracts and never back toward a framework or host-specific layer.

## Required rules

- `protocol` has no internal package dependencies.
- `runtime-core` may depend on `protocol`.
- `planner` may depend on `protocol` and narrow runtime-core types where explicitly required.
- `composer` may depend on `protocol`, planner output contracts, and adapter policy contracts; it must not depend on runtime-web.
- `adapter-sdk` may depend on `protocol`; it must not own runtime state.
- `runtime-web` may depend on runtime-core, protocol, composer output contracts, adapter-sdk, and security interfaces.
- `web-component` and `react` may depend on runtime-web/public SDK surfaces only.
- `tool-bridge` normalizes into protocol/domain-data and must not depend on runtime-web.

## Forbidden direction examples

```text
protocol      -> runtime-web   FORBIDDEN
runtime-core  -> react         FORBIDDEN
planner       -> DOM           FORBIDDEN
composer      -> customer API  FORBIDDEN
runtime-web   -> raw tool SDK  FORBIDDEN
react         -> planner internals FORBIDDEN
```

Automated dependency enforcement is intentionally scheduled for PR-002.
