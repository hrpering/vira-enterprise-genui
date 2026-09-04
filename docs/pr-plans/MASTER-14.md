# MASTER-14 — Multi-platform Studio Preview

## Responsibility

Provide one preview surface for Desktop, Mobile Web, iPhone and Android without pretending that a CSS viewport is a native renderer.

Authoritative two-level model:

```text
PREVIEW SESSION
Studio Workbench
      ↓
preview + publication snapshot (once)
      │
      ├── FAST PREVIEW
      │     ↓
      │   web semantic approximation
      │     ├── Desktop
      │     ├── Mobile Web
      │     ├── iPhone approximation
      │     └── Android approximation
      │
      └── REAL PREVIEW
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
2. One preview session snapshots canonical Workbench preview and publication results exactly once; edits require a new preview session.
3. Fast preview is explicitly marked `web-approximation` and `nativeAccuracy: false` for every target.
4. iPhone/Android fast preview never claims native fidelity.
5. Real native preview requires the captured canonical Workbench publication before preview Pack publication.
6. Real native preview consumes the existing MASTER-07 native mount-envelope authorities; MASTER-14 does not fork native projection semantics.
7. One preview session publishes one preview Pack identity; iOS and Android resolve separate platform-specific descriptors from that same Pack.
8. A single cross-platform `ResolvedExperienceDescriptor` is forbidden because Host compatibility is platform-specific.
9. After native envelope validation, iOS and Android must resolve the same Pack/version/entrypoint/artifact digest; otherwise preview fails `PREVIEW_PACK_DRIFT`.
10. Preview Pack references cross the canonical JSON boundary and are opaque references, not raw Pack payloads or secrets.
11. Runtime instance identity delegates to Runtime Core's canonical instance validator.
12. Native envelope validation remains fail-closed for host/platform/instance/brand/publication mismatch.
13. TypeScript prepares simulator/emulator launch artifacts; it does not emulate SwiftUI or Compose.
14. Real iOS Simulator / Android Emulator execution is an integration/E2E responsibility and remains part of the final verification gate.
15. No WebView, React Native, remote Swift/Kotlin or generated native code is introduced.
16. MASTER-14 does not own production deployment promotion; its provider creates/resolves preview-only artifacts through an injected boundary.
17. Unsupported/invalid preview artifacts do not fall back to another platform.

## RE/QC findings closed

- the first real-preview slice incorrectly attempted to share one resolved descriptor between iOS and Android; descriptors are platform-specific, so the model was corrected to one published Pack plus separate platform resolutions;
- native target parity is now enforced on canonical Pack/artifact identity after each platform's existing envelope validation;
- preview Pack handle input is normalized through canonical JSON parsing, preventing accessor-backed provider output from becoming trusted state;
- instance validation now delegates to Runtime Core instead of defining another instance regex;
- fast targets initially could observe different mutable Workbench states across toggles; preview/publication outputs are now captured once per preview session so fast and real modes refer to the same editor snapshot.

## Verification policy

Hosted CI is deferred. Final full CI must cover snapshot stability, fast-target semantics, canonical publication gating, one-preview-Pack identity across iOS/Android, platform-specific descriptor resolution, native-envelope rejection, Pack drift rejection, real iOS Simulator preview, real Android Emulator preview and same-Experience parity.
