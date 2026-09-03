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
published preview Pack (one identity)
      │
      ├── iOS-specific resolved descriptor
      │       ↓
      │   exact iOS mount envelope
      │       ↓
      │   iOS Simulator / test host
      │
      └── Android-specific resolved descriptor
              ↓
          exact Android mount envelope
              ↓
          Android Emulator / test host
```

## Invariants

1. Desktop, Mobile Web, iPhone and Android are peer preview targets.
2. Fast preview is explicitly marked `web-approximation` and `nativeAccuracy: false` for every target.
3. iPhone/Android fast preview never claims native fidelity.
4. Real native preview requires canonical Workbench publication before preview Pack publication.
5. Real native preview consumes the existing MASTER-07 native mount-envelope authorities; MASTER-14 does not fork native projection semantics.
6. One preview session publishes one preview Pack identity; iOS and Android resolve separate platform-specific descriptors from that same Pack.
7. A single cross-platform `ResolvedExperienceDescriptor` is forbidden because Host compatibility is platform-specific.
8. After native envelope validation, iOS and Android must resolve the same Pack/version/entrypoint/artifact digest; otherwise preview fails `PREVIEW_PACK_DRIFT`.
9. Preview Pack references cross the canonical JSON boundary and are opaque references, not raw Pack payloads or secrets.
10. Runtime instance identity delegates to Runtime Core's canonical instance validator.
11. Native envelope validation remains fail-closed for host/platform/instance/brand/publication mismatch.
12. TypeScript prepares simulator/emulator launch artifacts; it does not emulate SwiftUI or Compose.
13. Real iOS Simulator / Android Emulator execution is an integration/E2E responsibility and remains part of the final verification gate.
14. No WebView, React Native, remote Swift/Kotlin or generated native code is introduced.
15. MASTER-14 does not own production deployment promotion; its provider creates/resolves preview-only artifacts through an injected boundary.
16. Unsupported/invalid preview artifacts do not fall back to another platform.

## RE/QC findings closed

- the first real-preview slice incorrectly attempted to share one resolved descriptor between iOS and Android; descriptors are platform-specific, so the model was corrected to one published Pack plus separate platform resolutions;
- native target parity is now enforced on canonical Pack/artifact identity after each platform's existing envelope validation;
- preview Pack handle input is normalized through canonical JSON parsing, preventing accessor-backed provider output from becoming trusted state;
- instance validation now delegates to Runtime Core instead of defining another instance regex.

## Verification policy

Hosted CI is deferred. Final full CI must cover fast-target semantics, canonical publication gating, one-preview-Pack identity across iOS/Android, platform-specific descriptor resolution, native-envelope rejection, Pack drift rejection, real iOS Simulator preview, real Android Emulator preview and same-Experience parity.
