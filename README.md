# Vira Enterprise GenUI

Vira Enterprise GenUI is an embeddable, framework-agnostic generative UI runtime and integration SDK for enterprise AI systems.

It turns **intent + task state + domain data** from an existing AI, chatbot, agent, rules engine, or application backend into safe, brand-native interactive experiences without replacing the host AI or application stack.

## Runtime architecture

```text
Existing AI / Agent / Chatbot
            |
            | intent + state + domain data
            v
         protocol
            |
         planner
            |
         composer
            |
       runtime-core
            |
       adapter-sdk
            |
       runtime-web
        /       \
web-component  react
            |
      Host application
            |
      canonical action
            v
 Existing host/backend
```

## Experience Studio

Experience Studio is an optional visual authoring layer. Enterprise developers register approved brand components, data sources and action aliases; product/design teams then compose screens and flows without receiving arbitrary code or endpoint execution.

```text
Brand catalog + approved data/actions
               |
               v
       Human Studio Workbench
       Puck canvas + Vira panels
               |
       canonical StudioDocument
               |
        validate / publish
               |
        StudioPublication
               |
     Studio runtime bridge / React
               |
       existing Vira runtime
```

Puck is an editor implementation detail. `StudioDocument` and `StudioPublication` are the canonical Vira artifacts.

## Manual authoring

Developers can author the same canonical Studio document without opening Experience Studio. `@vira-enterprise-genui/studio-authoring` adds typed helpers around the existing Studio schema, preview, publication and portable-bundle gates; it does not introduce a second document or compiler format.

The workspace CLI accepts a raw document for validation or a config containing `{ document, componentCatalog, bindingSourceCatalog, actionAdapter }` for build/preview:

```bash
pnpm genui validate ./experience.json
pnpm genui build ./experience.config.ts
pnpm genui preview ./experience.config.ts --view main
```

Manual documents and Canvas documents round-trip through the same portable bundle and produce the same `StudioPublication` semantics.

## Core packages

- `protocol` — framework-neutral contracts.
- `runtime-core` — state, actions, patches, lifecycle, permissions and errors.
- `planner` — state/capability/experience/composition planning.
- `composer` — semantic regions and composition policies.
- `adapter-sdk` — brand, domain, intent, recipe, component, data, action and policy adapters.
- `runtime-web` — DOM renderer and browser lifecycle.
- `web-component` — thin `<vira-experience>` wrapper for the original runtime-web surface.
- `react` — thin React wrapper over the same runtime.
- `genui` — public Studio publication + host + React integration surface.
- `genui-web-component` — Studio publication Web Component adapter without changing the legacy wrapper.
- `studio-authoring` — canonical code-first/manual Studio authoring surface.
- `genui-cli` — validate/build/preview CLI over the same Studio gates.
- `security` — sanitization, allowlists, CSP and network policy.
- `telemetry` — provider-neutral telemetry interface.
- `tool-bridge` — normalization of external tool results.

Studio packages are isolated under `packages/studio-*`; production Studio React rendering does not depend on Puck.

## Browser demos

Runtime MVP path:

```bash
pnpm install
pnpm demo:flight-search
```

Human Experience Studio:

```bash
pnpm demo:experience-studio
```

Pegasus Chat demo:

```bash
pnpm demo:pegasus-chat
```

The approved flight flow in Pegasus Chat is rendered through the canonical Studio publication/runtime path rather than a chat-specific UI schema.

See `examples/flight-search-demo/README.md` and `examples/experience-studio-demo/README.md`.

## Security boundary

Neither the runtime nor Experience Studio provides arbitrary HTML, JavaScript, JSX, raw CSS, unrestricted API calls, a general workflow engine, a message queue, authentication, billing, model hosting or a replacement application backend.

Studio authors work only with components, properties, data sources and action aliases explicitly registered by the host integration.

## Development rule

Architecture and contracts come before implementation. Every implementation change must pass package boundaries, lint, type checking, tests, build, architecture/security review and reverse-engineering review before merge.

See `docs/architecture/` and `docs/studio/` before changing runtime or Studio contracts.
