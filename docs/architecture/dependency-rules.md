# Dependency rules

Dependencies must point toward stable semantic contracts and canonical owners, never back toward framework-, host-, provider- or customer-specific layers.

**Executable authority:** `tooling/package-boundaries.config.mjs`. This document explains invariants; it is not a competing allowlist.

## Required rules

- platform-neutral semantic/runtime owners do not import DOM, React, SwiftUI, Compose or customer backends;
- renderers/wrappers consume canonical runtime/publication surfaces rather than duplicate planning, state, governance or action logic;
- Studio authoring/editor surfaces consume canonical schema/publication owners and never become execution authority;
- Pack/Registry/Resolver/Deployment owners preserve exact identity/version resolution and do not depend on customer/domain integrations;
- protocol adapters normalize/project supported semantics and do not become canonical application semantics;
- governance providers are adapters behind provider-neutral governance owners;
- protected effects converge on Action Boundary/trusted adapter owners rather than direct renderer/provider execution;
- native SDKs map shared semantic contracts to platform implementations rather than fork persisted Experience semantics;
- generic packages do not import external-brand/domain proof code.

## Forbidden direction examples

```text
protocol / runtime-core  -> renderer/framework       FORBIDDEN
canonical owner          -> customer/domain proof    FORBIDDEN
Studio editor            -> protected backend        FORBIDDEN
renderer                 -> governance bypass        FORBIDDEN
protocol adapter         -> canonical semantic owner FORBIDDEN
Network/discovery        -> runtime execution owner  FORBIDDEN
```

Automated dependency enforcement is already implemented. Every dependency change must pass `pnpm check:boundaries`; future phase docs may describe intended edges but cannot override the executable graph.
