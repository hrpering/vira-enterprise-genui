# Airline Chat Demo

A customer-facing web chat that connects a real LLM to Vira Enterprise GenUI through the same single host integration boundary expected in production.

The chat shell uses the open-source `assistant-ui` primitives and Vercel AI SDK. The chat itself does not import Planner, Composer, Runtime Web, Security, seat maps, baggage cards, fare cards, insurance UI, or booking summary UI. It registers only `viraChatToolkit`. All interactive reservation UI is mounted by Vira through the public `@vira-enterprise-genui/react` wrapper and the airline brand component port.

## Integration shape

```text
customer message
      ↓
assistant-ui web chat
      ↓
/api/chat
      ↓
real LLM (server-side)
      ↓
┌─────────────────────────────┐
│ vira_present_experience     │ create/mount a Vira experience
│ vira_interact               │ act on the mounted Vira session
└─────────────────────────────┘
      ↓
ONE registered Vira connector
      ↓
@vira-enterprise-genui/react
      ↓
Vira Planner + Composer + Runtime Web
      ↓
airline brand component port
      ↓
interactive reservation experience
      ↓
canonical Vira actions
      ↓
host action/backend boundary
      ↓
canonical Runtime patches
```

`components/airline-chat.tsx` knows only about `viraChatToolkit`. It does not contain airline booking UI or call Vira internals directly.

## Reservation flow

The mounted Vira experience supports a complete checkout configuration flow:

```text
Search
  ↓
Flight offer
  ↓
Fare comparison
  ↓
All traveller details
  ↓
Seat map / one seat per traveller
  ↓
Checked baggage per traveller or apply-to-all
  ↓
Insurance + airport/flight extras
  ↓
Full trip and price review
  ↓
Airline secure-checkout handoff boundary
```

The experience includes fare-family comparisons, included-service awareness, seat zones and occupancy, fare-aware seat pricing, fare-aware baggage pricing, passenger-specific selections, insurance, priority boarding, fast track, meals, SMS updates, a live journey rail, a live total, and a detailed final breakdown.

## Chat can operate the mounted Vira session

Follow-up language is not only answered as prose. When appropriate the real LLM calls `vira_interact`, and the connector dispatches a canonical Vira action into the currently mounted session.

Useful tests:

```text
Use the cheapest option.
Choose the Smart fare.
Put us near the front.
Add 20kg baggage for everyone.
Add travel insurance.
Add priority boarding.
```

Those commands update the same mounted Vira experience instead of rendering replacement chat UI.

## Configure a real model

From the repository root:

```bash
cp examples/pegasus-chat-demo/.env.example examples/pegasus-chat-demo/.env.local
```

Set at least:

```bash
OPENAI_API_KEY=sk-...
```

Optional:

```bash
OPENAI_MODEL=gpt-5.6-luna
OPENAI_BASE_URL=https://api.openai.com/v1
```

`OPENAI_API_KEY` stays server-side in the Next.js route and is never exposed to browser code.

## Install and run

```bash
pnpm install
pnpm demo:pegasus-chat
```

Open:

```text
http://127.0.0.1:4180
```

Start with:

```text
Find me a flight from Istanbul to Berlin on 2026-09-03 for 2 people.
```

Then either use the mounted reservation UI or continue naturally in chat.

## Validation

Run the repository gate:

```bash
pnpm verify
```

Then the isolated Next.js demo gate:

```bash
pnpm demo:pegasus-chat:check
```

## Reality boundary

The LLM call is real and the Vira Planner/Composer/React SDK/Runtime/action/patch path is real.

This repository does **not** have access to Pegasus Airlines' commercial inventory, booking, or payment APIs. The flight inventory executor is therefore deterministic and lives only at the host/backend boundary. The final step truthfully stops at an `airline-secure-checkout` handoff state; it does not fabricate a payment, PNR, ticket, or booking reference.

Replacing the deterministic inventory executor and checkout handoff with authorized airline APIs does not require changing the chat-to-Vira integration boundary.

This is an internal product demonstration and is not an official Pegasus Airlines application.
