# MASTER-19 — Accessibility + Localization + Native UX Gate

## Responsibility

Make accessibility, localization and platform-native UX acceptance part of the canonical cross-platform release contract rather than post-release polish.

```text
Canonical Experience
        ↓
Localization semantics
        ↓
Web / iOS / Android hosts
        ↓
platform accessibility evidence
        ↓
Native UX acceptance gate
        ↓
Cross-platform semantic conformance
```

## Required platform evidence

Web:

```text
keyboard navigation
ARIA semantics
screen-reader behavior
```

iOS:

```text
VoiceOver
Dynamic Type
HIG behavior
```

Android:

```text
TalkBack
font scaling
Compose semantics
```

Every platform record is mandatory and exact. Missing or duplicate platform evidence fails closed.

## Localization semantic contract

The portable semantic intent includes:

```text
locale
direction (LTR / RTL)
currency
time zone
numbering system
date style
time style
number style
```

The contract intentionally does **not** copy a Web-formatted display string to native platforms. Each Host uses its native formatter and native UX conventions while preserving the same canonical formatting intent.

## Conformance integration

MASTER-18 semantic snapshots now include localization semantics as a first-class dimension. Web/iOS/Android must preserve the same localization intent in addition to component/state/action/navigation/policy/accessibility/revision/outcome parity.

Snapshot roots, policy-call records and accessibility records are exact plain-object evidence. Unknown extra fields are rejected instead of becoming hidden platform-specific side channels.

## Acceptance semantics

Malformed evidence and failed accessibility acceptance are deliberately different:

- malformed or incomplete evidence -> `ok: false`;
- structurally valid evidence with a failed required capability -> `ok: true`, `accepted: false`, with dimension-specific failures;
- complete passing evidence -> `ok: true`, `accepted: true`.

This allows the final RC gate to explain exactly why a platform is blocked.

## Security / privacy invariants

1. The gate stores no raw accessibility trees, screenshots, user content, credentials or secrets.
2. Evidence records use a bounded exact schema and reject unknown fields.
3. Localization data is semantic configuration only; it carries no raw formatted application data.
4. No platform may substitute another platform's accessibility result.
5. Web is not the native UX authority for iOS or Android.
6. RTL is an explicit semantic direction and cannot be inferred from rendered text during conformance.

## RE/QC findings closed

- no existing package owned the complete MASTER-19 acceptance contract, so a small independent `native-ux-gate` authority was added;
- MASTER-18 originally compared accessibility metadata but had no localization dimension; localization semantics are now part of every cross-platform snapshot;
- conformance snapshots previously tolerated unknown root/nested evidence fields; MASTER-19 tightens these boundaries to exact plain objects;
- the first localization parser result type overlapped the gate-report success type and could widen TypeScript success values; parser and gate result authorities are now separate;
- existing MASTER-18 fixture tests were migrated to carry localization semantics explicitly.

## Final verification policy

Hosted CI remains deferred. The final local/full gate must exercise real browser keyboard/screen-reader semantics, iOS Simulator VoiceOver/Dynamic Type/HIG behavior, Android Emulator TalkBack/font scaling/Compose semantics, RTL fixtures and locale/currency/date/time/number semantics across the shared conformance corpus.
