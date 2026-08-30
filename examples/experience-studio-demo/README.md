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

The home screen lists persisted experiences and approved starter GenUI surfaces for flight search, special assistance, missed-flight policy, visa checks, and a blank layout.

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

A production host must execute its own host effect and call `complete()` with the real `success`, `empty`, or `error` outcome.

## Browser acceptance gate

```bash
pnpm verify:browser
```

The Chromium test performs the full user lifecycle:

1. create a new persisted flight-search experience;
2. open the real Puck workbench;
3. publish it through the lifecycle service and Studio publish gate;
4. open `/live/<id>` and verify the published runtime actually renders;
5. trigger the same published interaction twice and verify the demo host completes both actions instead of leaving the runtime stuck in `ACTION_PENDING`;
6. unpublish it and verify the live URL becomes unavailable;
7. delete the draft and verify it disappears from the Studio library.

The test does not accept a status label such as “Published” as proof of publication; it verifies the separate live runtime route and the action completion lifecycle.
