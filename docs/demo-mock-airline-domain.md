# Shared mock airline domain demo

The local Chat Demo and Experience Studio use one deterministic fake airline repository.

```text
User message / Studio live controls
              |
              v
 @vira-enterprise-genui/mock-airline-domain
              |
      +-------+--------+
      |                |
      v                v
 Chat LLM tools    Studio domain bindings
      |                |
      v                v
 Vira chat UI      Published Studio runtime
```

## Why

The LLM must not invent flight numbers, prices, availability or policy facts, and Studio documents must not treat example values such as `SAW`, `BER`, `2 passengers`, or `138 EUR` as production data.

The mock repository is still fake, but it behaves like a customer domain service and creates the integration boundary that a real backend will replace later.

## Local smoke test

From the repo root:

```bash
pnpm install
pnpm demo:compare
```

Open:

- Experience Studio: `http://127.0.0.1:4173`
- Chat Demo: `http://127.0.0.1:4180`

Create a **new** Studio experience from a booking starter, publish it, and open the live URL. The live page exposes a small `Mock airline domain` control panel. Change origin, destination, date, passenger count, or fare and verify that bound component props update without editing the Studio document.

Then ask Chat:

```text
Find flights from Istanbul to Rome on 2026-09-15 for 3 people.
```

The `vira_present_experience` tool calls the same repository. For the default mock dataset, the result resolves the route to `SAW -> FCO`; prices are calculated from the repository for 3 passengers.

## Boundary

This is demo infrastructure, not a production airline API. A production host should replace this package with an HTTP/domain adapter while preserving:

- structured tool results,
- Studio domain-source paths or an equivalent registered catalog,
- server-side publication validation,
- the trusted runtime data port.

Existing Studio records created before this change are not silently rewritten. Create a new experience (or rebind an old one in Studio) to exercise the new domain-bound path.
