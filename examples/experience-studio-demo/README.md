# Vira Experience Studio lifecycle demo

This browser demo proves the complete local Studio lifecycle instead of only showing an in-memory Puck authoring shell.

```text
Create persisted draft
      ↓
Edit in Vira Experience Studio / Puck
      ↓
Studio publish validation + StudioPublication
      ↓
Persist publication on the demo server
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

## Persistence

This demo uses a real file-backed server store under `examples/experience-studio-demo/.data/`. Drafts and publications survive browser refreshes and server restarts. `.data/` is ignored by git.

This is intentionally a **demo persistence adapter**, not a claim of production cloud persistence, tenancy, authentication, or deployment infrastructure. Replacing the file store with a database/object store does not change the Studio `StudioDocument → StudioPublication → Studio Runtime` path proven here.

## Browser acceptance gate

```bash
pnpm verify:browser
```

The Chromium test performs the full user lifecycle:

1. create a new persisted flight-search experience;
2. open the real Puck workbench;
3. publish it through the Studio publish gate;
4. open `/live/<id>` and verify the published runtime actually renders;
5. unpublish it and verify the live URL becomes unavailable;
6. delete the draft and verify it disappears from the Studio library.

The test does not accept a status label such as “Published” as proof of publication; it verifies the separate live runtime route.
