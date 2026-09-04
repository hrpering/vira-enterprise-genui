# Pegasus proof evidence schema — v1

`MASTER-25` consumes this evidence through `VIRA_PEGASUS_PROOF_EVIDENCE`.
The file is intentionally exact-shape and must target the exact current Vira checkout.

```json
{
  "version": "1",
  "viraHead": "0123456789abcdef0123456789abcdef01234567",
  "pack": {
    "id": "publisher/pegasus-proof",
    "version": "1.0.0",
    "digest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  },
  "platforms": {
    "web": { "passed": true, "traceRef": "traces/web-1" },
    "ios": { "passed": true, "traceRef": "traces/ios-1" },
    "android": { "passed": true, "traceRef": "traces/android-1" }
  },
  "gates": {
    "samePackIdentity": true,
    "actionBoundary": true,
    "governanceApproval": true,
    "observabilityLedger": true,
    "crossPlatformConformance": true,
    "accessibilityLocalization": true,
    "crossTenantDenied": true,
    "wrongPackVersionDenied": true,
    "unknownComponentDenied": true,
    "unknownActionDenied": true,
    "unsignedArtifactDenied": true,
    "staleRevisionDenied": true,
    "duplicateRetryDenied": true,
    "reconnectCacheVerified": true
  }
}
```

The example values above are illustrative only. `viraHead` must equal `git rev-parse HEAD` of the exact release-candidate checkout and the Pack digest must be the real verified `sha256:` digest. Missing fields, unknown fields, false gates, malformed trace references or evidence from another Vira head fail closed.
