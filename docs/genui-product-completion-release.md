# GenUI product-completion release gate

This release stack completes the path from first-class manual authoring and Experience Studio Canvas authoring to one canonical `StudioExperienceDocument`, `StudioPublication`, Studio runtime, React/Web Component consumption and an opt-in Chat publication bridge.

## Product invariant

```text
Manual authoring ---------\
                          > StudioExperienceDocument
Experience Studio / Puck-/             |
                                        v
                              prepareStudioPublication
                                        |
                                        v
                               StudioPublication
                                        |
                              StudioRuntimeSession
                               /        |        \
                            React   Web Component  Chat
```

There is no manual-only schema, compiler, publication format or runtime. Puck remains an editor representation only.

## Stacked phases

1. GENUI-122 — manual authoring foundation
2. GENUI-123 — manual validate/build/preview tooling
3. GENUI-124 — portable bundle bridge
4. GENUI-125 — manual/Canvas semantic parity
5. GENUI-126 — generic form and feedback primitives
6. GENUI-127 — golden multi-view airline experience
7. GENUI-128 — manual golden consumer
8. GENUI-129 — full golden manual/Canvas parity
9. GENUI-130 — host SDK ergonomics
10. GENUI-131 — Studio React/Web Component consumer parity
11. GENUI-132 — opt-in Chat to approved Studio publication bridge
12. GENUI-133 — this release gate

All branches remain unmerged until the final stacked head passes local verification.

## Required local verification

From the final stacked branch:

```bash
pnpm install
pnpm verify:genui
pnpm verify:all
```

The focused gate covers manual authoring, portable bundles, Puck round-trip parity, generic form primitives, the nine-view golden journey, manual golden build, host factories, React/Web Component consumption and Chat publication resolution. `verify:all` remains the authoritative repository-wide release gate.

## Browser acceptance

Run the existing Experience Studio browser suite through `pnpm verify:all`, then manually exercise both Chat modes.

Default migration-safe Chat path:

```bash
pnpm demo:pegasus-chat
```

Published Studio Chat path:

```bash
NEXT_PUBLIC_VIRA_STUDIO_CHAT=1 pnpm demo:pegasus-chat
```

For the Studio path, search flights with a fully specified route/date/passenger request and confirm that the approved golden publication renders and can advance through the booking views. The default path must remain functional until the existing assistant-command behavior is migrated to the Studio host/action model and separately accepted.

## Merge discipline after acceptance

Do not merge the final head as one opaque change. Merge the stacked PRs in logical order, squash each phase, retarget/rebase the next PR onto the new authoritative `main`, rerun diff hygiene and preserve the final local verification evidence. If any retarget changes code semantics, rerun the affected focused gate before continuing.

## Blocking conditions

The release is blocked by any of the following:

- manual and Canvas publications differ after canonical round-trip;
- a new authoring path bypasses `prepareStudioPublication`;
- Puck-only state becomes persisted canonical state;
- arbitrary Chat publication identities are accepted;
- a customer/backend endpoint or credential enters a declarative Studio artifact;
- renderer registry parity fails;
- package boundary, lint, typecheck, test, build, Studio browser or Chat build gates fail;
- either default Chat or opt-in published Studio Chat cannot start and render its intended experience.
