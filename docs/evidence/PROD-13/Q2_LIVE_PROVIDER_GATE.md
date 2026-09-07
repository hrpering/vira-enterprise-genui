# PROD-13 — Q2 Real Provider Live Gate

## Purpose

Hosted CI already proves PROD-13 static semantics, PostgreSQL durability/RLS/CAS, provider orchestration, native builds and browser regression. It does **not** prove that the credential-bearing reference adapters can produce and independently verify a real external effect.

PROD-13 production-authoritative closure therefore requires a separate opt-in live gate against dedicated reversible canary resources.

## Gate

Run from a clean exact PROD-13 branch:

```bash
pnpm verify:prod13:local -- --full
```

`--full` now includes:

- full repository verification;
- production PostgreSQL live verification;
- real GitHub provider mutation proof;
- real Google Calendar provider mutation proof;
- browser E2E;
- iOS Simulator;
- Android Emulator;
- final exact-HEAD / branch / clean-tree revalidation.

The gate may also be isolated with:

```bash
pnpm verify:prod13:local -- --live-provider
```

## Explicit opt-in

Real mutations are disabled unless:

```text
VIRA_PROD13_LIVE_PROVIDER_ENABLED=1
```

Ordinary repository/PR test discovery skips the live mutation suite when this variable is absent. The authoritative local closure verifier fails closed *before running closure work* when `--full` or `--live-provider` requests the live proof without this explicit opt-in. Do not enable it on normal developer resources.

## GitHub canary requirements

Required environment variables:

```text
VIRA_PROD13_GITHUB_TOKEN
VIRA_PROD13_GITHUB_OWNER
VIRA_PROD13_GITHUB_REPO
VIRA_PROD13_GITHUB_PATH
VIRA_PROD13_GITHUB_BRANCH
```

The target must be an **existing dedicated UTF-8 text canary file** on a dedicated test branch/repository. The proof:

1. independently GETs the existing file and records its exact blob SHA/content;
2. conditionally PUTs a unique proof marker using that exact SHA;
3. independently GETs again and proves a different blob SHA plus the marker;
4. rereads current provider truth;
5. conditionally restores the original bytes using the current SHA;
6. independently GETs again and proves the original bytes are restored.

Git history remains as immutable external evidence even after content restoration.

## Google Calendar canary requirements

Required environment variables:

```text
VIRA_PROD13_GOOGLE_ACCESS_TOKEN
VIRA_PROD13_GOOGLE_CALENDAR_ID
VIRA_PROD13_GOOGLE_EVENT_ID
VIRA_PROD13_GOOGLE_EVENT_BODY_JSON
```

`VIRA_PROD13_GOOGLE_EVENT_BODY_JSON` must be the canonical mutable body of a **dedicated disposable single-event canary** and must include at least `summary`, `start` and `end`.

The proof:

1. independently GETs the event and checks baseline summary/start/end before mutation;
2. conditionally PUTs a unique summary marker with the exact observed ETag via `If-Match`;
3. independently GETs again and proves a changed ETag plus the marker;
4. rereads current provider truth;
5. conditionally restores the baseline event body with the current ETag;
6. independently GETs again and proves baseline summary/start/end are restored.

Use a dedicated canary calendar/event because Calendar `events.update` is a full-resource update boundary.

## Security and evidence rules

- Tokens/credentials are supplied only through process environment and resolved through the Private Runner secret-provider boundary.
- Credentials must never be printed, persisted to repository evidence or copied into provider observation/ledger JSON.
- A provider write response is never accepted as postcondition truth; every effect requires an independent reread.
- GitHub uses exact blob-SHA conditional writes; Google Calendar uses exact ETag / `If-Match` conditional writes.
- Cleanup uses fresh provider truth, not the stale pre-effect token.
- If mutation succeeds but cleanup cannot be proven, the gate fails and the canary resource must be manually inspected before another run.

## Closure invariant

`closureEligible=true` for PROD-13 is invalid unless the real-provider gate ran successfully in the same exact-head verification invocation. Hosted CI green alone remains necessary but not sufficient for production-authoritative PROD-13 closure.
