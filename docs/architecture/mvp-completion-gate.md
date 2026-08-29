# MVP completion gate

This document defines the closure gate for the Vira Enterprise GenUI MVP. It is intentionally narrower than a product roadmap: the MVP is the embeddable, provider-neutral GenUI runtime and SDK layer, not a model host, workflow engine, visual builder, authentication platform, or message queue.

## Canonical MVP path

```text
Host AI / Agent / Backend
          |
          | intent + state + domain/tool results
          v
      Protocol v1
          |
          v
        Planner
          |
          v
       Composer
          |
          v
      Adapter SDK
          |
          v
 Security gates -> Runtime Core -> Runtime Web
                         |
                         +-> Web Component
                         +-> React wrapper
                         |
                         v
                  canonical host action
                         |
                         v
                 existing host backend

External tool results -> Tool Bridge -> Protocol DomainData
Lifecycle/action signals -> Telemetry -> trusted host exporter
```

## Completion matrix

| MVP surface | Closure evidence |
| --- | --- |
| Protocol | strict v1 contract tests for intent, capability, DomainData, ExperiencePlan, patch, and versioning |
| Planner | deterministic golden pipeline plus fail-closed resolver tests |
| Composer | semantic composition integration plus strict policy/region validation |
| Adapter SDK | deterministic golden integration covering brand, intent, recipe, domain, data, component, action, and policy adapters |
| Runtime Core | state, lifecycle, reducer, patch, permission, and action contract suites |
| Runtime Web | deterministic golden mount/action/state integration plus explicit capability and component authorization gates |
| Web Component | wrapper golden integration and element/event contracts |
| React | lifecycle-session wrapper contract delegating to the Runtime Web SDK with explicit policy configuration |
| Security | plain-text sink, exact capability/component allowlists, exact network policy, and CSP host requirements |
| Tool Bridge | custom/MCP/LangChain normalization golden integration with freshness and error redaction |
| Telemetry | event contract, trusted exporter port, bounded lifecycle channel, and privacy-first golden integration |
| Cross-package MVP | `tests/integration/mvp-completion-gate.test.ts` exercises the public host-to-experience path and fail-closed policy path across package boundaries |

## What the cross-package gate proves

The success path starts from host-owned intent/state, creates an ExperiencePlan, composes semantic regions, resolves an approved brand component, mounts through Runtime Web only after exact capability/component authorization, converts a user event into a canonical host action, authorizes the intended network target, normalizes a structured tool result back into Protocol DomainData, and exports bounded privacy-safe telemetry through a host-owned exporter.

The deny path proves that an unapproved component is rejected before DOM work, a denied action does not mutate runtime state or produce host effects, and a disallowed network method is rejected by exact policy.

## MVP non-goals preserved

The completion gate does not add model inference, RAG, workflow orchestration, arbitrary HTML, custom JavaScript, iframe execution, dynamic code evaluation, authentication/billing, persistence, a message queue, background telemetry workers, hidden retries, generated telemetry IDs, hidden clocks, or vendor-specific observability dependencies.

## Release criterion

The implementation is an **MVP code-complete candidate** when the stacked closure PRs are present. It becomes an **MVP release candidate** only when the canonical stack is merged and the repository's `pnpm verify` gate (boundaries, lint, typecheck, tests, and build) executes successfully in CI or an equivalent trusted environment.

A GitHub Actions runner-allocation failure is infrastructure failure, not a passing verification result; it must remain a visible release blocker until `verify` actually runs.
