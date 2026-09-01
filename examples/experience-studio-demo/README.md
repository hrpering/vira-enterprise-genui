# Vira Experience Studio lifecycle demo

This browser demo proves the complete local Studio lifecycle instead of only showing an in-memory Puck authoring shell.

```text
Create / edit in Experience Studio
      ↓
version-aware demo API client
      ↓
StudioLifecycleService
      ↓
canonical Studio validation + publication compiler
      ↓
StudioLifecycleStore
      ↓
local file adapter (.data)
      ↓
/live/<experience-id>
      ↓
Studio Runtime + Studio Runtime React
      ↓
trusted airline renderer registry
```

The same experience can then be **unpublished** (the draft remains, the live URL immediately stops resolving) or **deleted** (both the draft and any publication are removed).

## Run

From the repository root:

```bash
pnpm install
pnpm demo:experience-studio
```

Open:

```text
http://127.0.0.1:4173
```

The home screen lists persisted experiences and approved starter GenUI surfaces. In addition to individual flight/guidance starters, the **Full booking journey** starter creates one editable nine-view document:

```text
Flight Search
  -> Flight Results
  -> Fare Comparison
  -> Traveller Details
  -> Seat Selection
  -> Baggage
  -> Extras
  -> Booking Review
  -> Confirmation
```

This is not nine opaque template aliases. Each view is a canonical authored node graph. Flight Results is a fully editable repeated card using `currentItem` scope; the other booking screens keep only business-critical airline behavior inside trusted widgets while surrounding layout, heading, supporting copy, cards and notices remain normal Studio nodes.

## Component authoring surface

The reference airline catalog includes the existing composable layout/content primitives plus a bounded form/feedback kit:

- Input (`text`, `email`, `date`)
- Textarea
- Select
- Checkbox
- Radio group
- Field group with a real child slot
- Alert
- Progress
- Spinner
- Empty state

These are normal Brand Package components. Their props appear through the existing Puck/Inspector metadata path; workbench and runtime renderer registries must exactly match the active catalog. Interactive primitives declare typed event payloads, but they do not invent a generic backend or hidden form-state store. A production brand makes them operational by connecting their declared events/data bindings to approved host actions and state/domain sources.

## Compare Studio and chat side by side

Run both demos at the same time from one terminal:

```bash
pnpm demo:compare
```

Then open the two independent applications side by side in the browser:

```text
Experience Studio  http://127.0.0.1:4173
Pegasus chat       http://127.0.0.1:4180
```

They are intentionally separate applications. This makes it possible to build/publish an experience in Studio while keeping the real chat demo open next to it for visual and behavioral comparison.

## Persistence and concurrency

This demo uses the product `@vira-enterprise-genui/studio-lifecycle` service with a file-backed `StudioLifecycleStore` adapter under `examples/experience-studio-demo/.data/`. Drafts and publications survive browser refreshes and server restarts. `.data/` is ignored by git.

The browser remembers each lifecycle `recordVersion` and serializes save/publish/unpublish/delete mutations. The server passes that expected version to `StudioLifecycleService`, and the file adapter performs the compare-and-swap check inside a single-process mutation queue. A stale browser tab therefore receives a lifecycle conflict instead of silently overwriting newer work.

Older demo records written before the lifecycle package existed are migrated to a conservative lifecycle-version baseline when they are read. Newly written files always use the canonical lifecycle record shape.

This remains intentionally a **local demo persistence adapter**, not a claim of production cloud persistence, tenancy, authentication, cross-process locking, or deployment infrastructure. A production database/object-store adapter must implement the `StudioLifecycleStore` atomic expected-version contract using the storage system's real conditional-write primitive.

## Publish authority

The browser no longer sends an arbitrary publication for the server to persist. Publish requests carry only the expected lifecycle version. `StudioLifecycleService` validates the persisted draft and creates the canonical `StudioPublication` on the server-side product boundary.

This preserves the Studio contract that ordinary draft saves do not silently mutate the live artifact. A later draft remains separate until an explicit republish succeeds.

## Demo host action completion

Published Studio interactions still follow the canonical runtime action lifecycle. A successful interaction creates a host action and the Studio runtime waits for a host outcome before accepting the next interaction.

The local demo has no airline backend, so its live host explicitly acknowledges each successful starter action with a `success` completion. This is demo-only host behavior: it prevents a successful action from remaining permanently pending, but it does **not** claim that an external airline operation, booking, seat assignment, payment, or policy workflow succeeded.

A production host must execute its own host effect and return the real `success`, `empty`, or `error` outcome through the host boundary.

## Browser acceptance gate

```bash
pnpm verify:browser
```

The browser suite covers both lifecycle and authoring acceptance. It verifies the persisted create/publish/live/unpublish/delete flow and also creates the Full booking journey, checks all nine views and the expanded primitive catalog, selects the Confirmation view, publishes the journey, and fails on known fatal console regressions.

The test does not accept a status label such as “Published” as proof of publication; it verifies the separate live runtime route and canonical host action completion lifecycle.
