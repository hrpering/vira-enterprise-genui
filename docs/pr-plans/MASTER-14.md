# MASTER-14 — Multi-platform Studio Preview

## Responsibility

Provide two explicitly different preview levels for the same canonical Studio artifact.

```text
Studio artifact
   │
   ├── Fast Preview
   │      ├── Desktop
   │      ├── Mobile Web
   │      ├── iPhone semantic approximation
   │      └── Android semantic approximation
   │
   └── Real Preview
          ├── verified + registered published preview Pack
          ├── iOS Simulator / native test host
          └── Android Emulator / native test host
```

## Invariants

1. Fast preview delegates canonical Studio validation/view projection to `prepareStudioPreview()`.
2. Fast iPhone/Android preview is explicitly marked semantic approximation; it never claims that a native renderer executed.
3. Real preview supports only iOS and Android native targets.
4. Real preview requires a Pack that passes MASTER-11 integrity verification and is present as an active registered artifact.
5. Native preview runners are injected test-host adapters; MASTER-14 does not embed simulator/emulator orchestration into portable runtime packages.
6. Runner input receives a canonical immutable Pack snapshot rebuilt after verification, not the caller's mutable object.
7. Native runner success is accepted only through exact target/artifact/digest/native-renderer attestation.
8. Accessor/prototype/symbol-backed attestation output fails closed without invoking getters.
9. CSS viewport emulation must never be represented as real native preview.
10. Final MASTER-25 E2E must bind the runner SPIs to real iOS Simulator and Android Emulator/test-host executions.

## Verification policy

Hosted CI is deferred. Final local/full CI must cover valid fast preview, explicit native semantic-approximation marking, Pack verification/registration, canonical Pack handoff, target mismatch, forged attestation, accessor-backed attestation rejection, iOS Simulator E2E and Android Emulator E2E.
