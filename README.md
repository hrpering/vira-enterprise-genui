# Vira Enterprise GenUI

Vira Enterprise GenUI is an embeddable, framework-agnostic generative UI runtime and integration SDK for enterprise AI systems.

It turns **intent + task state + domain data** from an existing AI, chatbot, agent, rules engine, or application backend into safe, brand-native interactive experiences without replacing the host AI or application stack.

## MVP architecture

```text
Existing AI / Agent / Chatbot
            |
            | intent + state + domain data
            v
         protocol
            |
            v
         planner
            |
            v
         composer
            |
            v
       runtime-core
            |
       adapter-sdk
            |
            v
       runtime-web
        /       \
web-component  react
            |
            v
    Host application
            |
      canonical action
            v
 Existing host/backend
```

## Core packages

- `protocol` — framework-neutral contracts.
- `runtime-core` — state, actions, patches, lifecycle, permissions, errors.
- `planner` — state/capability/experience/composition planning.
- `composer` — semantic regions and composition policies.
- `adapter-sdk` — brand, domain, intent, recipe, component, data, action, and policy adapters.
- `runtime-web` — DOM renderer and browser lifecycle.
- `web-component` — thin `<vira-experience>` wrapper.
- `react` — thin React wrapper over the same runtime.
- `security` — sanitization, allowlists, CSP and network policy.
- `telemetry` — provider-neutral telemetry interface.
- `tool-bridge` — normalization of external tool results.

## Browser demo

The Flight Search example exercises the public MVP path in a real browser while keeping business execution in the host application:

```bash
pnpm install
pnpm demo:flight-search
```

Then open `http://127.0.0.1:4173/examples/flight-search-demo/`. See `examples/flight-search-demo/README.md` for the exact Planner → Composer → Security → Runtime Web → Tool Bridge → Runtime patch → Telemetry flow.

## Non-goals for v0.1

Vira Enterprise GenUI is not a chatbot, model host, RAG stack, workflow engine, message queue, authentication product, billing system, visual builder, or replacement application backend.

## Development rule

Architecture and contracts come before implementation. Every implementation PR must pass tests, architecture QC, security QC, and an independent reverse-engineering review before merge.

See `docs/architecture/` and `docs/pr-plans/` before changing code.
