# MASTER-14 — Multi-platform Studio Preview

## Responsibility

Provide one preview surface for Desktop, Mobile Web, iPhone and Android without pretending that a CSS viewport is a native renderer.

Authoritative two-level model:

```text
FAST PREVIEW
Studio Workbench
      ↓
canonical Studio preview
      ↓
web semantic approximation
      ├── Desktop
      ├── Mobile Web
      ├── iPhone approximation
      └── Android approximation

REAL PREVIEW
Studio Workbench
      ↓
canonical publication
      ↓
published preview Pack / resolved descriptor
      ├── exact iOS mount envelope → iOS Simulator / test host
      └── exact Android mount envelope → Android Emulator / test host
```

## Invariants

1. Desktop, Mobile Web, iPhone and Android are peer preview targets.
2. Fast preview is explicitly marked `web-approximation` and `nativeAccuracy: false` for every target.
3. iPhone/Android fast preview never claims native fidelity.
4. Real native preview requires canonical Workbench publication before preview Pack publication.
5. Real native preview consumes the existing MASTER-07 native mount-envelope authorities; MASTER-14 does not fork native projection semantics.
6. iOS and Android real preview share one cached published preview descriptor per preview session, preventing target drift.
7. Native envelope validation remains fail-closed for host/platform/instance/brand/publication mismatch.
8. TypeScript prepares simulator/emulator launch artifacts; it does not emulate SwiftUI or Compose.
9. Real iOS Simulator / Android Emulator execution is an integration/E2E responsibility and remains part of the final verification gate.
10. No WebView, React Native, remote Swift/Kotlin or generated native code is introduced.
11. MASTER-14 does not own production deployment promotion; its publisher creates preview-only resolved artifacts through an injected boundary.
12. Unsupported/invalid preview artifacts do not fall back to another platform.

## Verification policy

Hosted CI is deferred. Final full CI must cover fast-target semantics, canonical publication gating, one-preview-Pack identity across iOS/Android, native-envelope rejection, real iOS Simulator preview, real Android Emulator preview and same-Experience parity.
