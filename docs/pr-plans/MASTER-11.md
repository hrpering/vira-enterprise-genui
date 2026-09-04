# MASTER-11 — Publication / Artifact / Deployment Plane

## Responsibility

Turn the existing canonical `ExperiencePackManifest` into a verified, signed, content-addressed release artifact with explicit environment deployment history.

```text
StudioPublication
      ↓
existing Experience Pack manifest
      ↓
canonical serialization
      ↓
manifest digest
      ↓
signature verification
      ↓
artifact registry
      ↓
DEV → STAGING → PRODUCTION
      ↓
inspect / rollback / deprecate
```

MASTER-11 does not create a second Pack schema. `@vira-enterprise-genui/experience-packs` remains the manifest authority.

## Invariants

1. Canonical Pack validation/serialization is delegated to the existing Experience Pack package.
2. Signed envelope binds exact canonical manifest digest + signature metadata.
3. Digest mismatch and signature verification failure fail closed.
4. Pack `id + version` is immutable: one release version cannot later point to another manifest digest.
5. Publish registers a verified artifact and deploys only to `dev`.
6. Promotion is adjacent and forward-only: `dev -> staging -> production`.
7. Promotion requires the source environment to run the exact pack id/version/digest.
8. Each environment has a monotonic safe deployment revision and explicit history.
9. Rollback targets historical state of the exact same environment and re-verifies the stored signed Pack before admission.
10. Deprecation is non-destructive: it does not silently undeploy a running artifact, but blocks new publish/promotion/rollback/cache admission.
11. All registry/deployment mutations are serialized through one ordering boundary.
12. Mobile/offline cache admission always re-validates canonical Pack digest and signature; unsigned/unverified Packs fail closed.
13. No raw private signing key enters the deployment plane. Signature verification is injected through `ViraDeploymentIntegrityProvider`.
14. MASTER-11 does not own organization/environment RBAC or secrets; those arrive in MASTER-12.

## Signed Pack envelope

```text
version
manifest              # existing canonical ExperiencePackManifest
manifestDigest         # lowercase sha256:<64 hex>
signature
  algorithm            # ed25519 | ecdsa-p256-sha256
  keyId
  value
```

The integrity provider receives canonical serialized manifest data for digesting and the digest/signature envelope for verification.

## Operations

### publish

Verified Pack -> immutable artifact registry -> `dev` deployment.

### promote

Exact artifact:

```text
dev -> staging
staging -> production
```

Environment skipping is rejected.

### rollback

A rollback references one exact historical deployment ID from the same environment. The stored signed artifact is re-verified before creating a new deployment revision.

### deprecate

Marks the registry artifact deprecated. Existing deployment history is retained; new admission paths reject it.

### inspect

Returns immutable registry, current environment targets and ordered deployment history.

### verifyCachedPack

Re-runs Pack validation + canonical digest + signature verification before a mobile/offline client may accept a cached Pack. Known deprecated artifacts are rejected.

## Out of scope

- organization/project/environment access policy (MASTER-12);
- secret storage/signing-key custody (MASTER-12);
- private enterprise registry UX/catalog governance (MASTER-21);
- Pack domain templates (MASTER-22);
- revocation/purge semantics beyond deprecation;
- network/blob-storage implementation.

## Verification policy

Hosted CI is deferred. Final local/full CI must cover signed publish, digest/signature rejection, immutable versions, adjacent promotion, history-bound rollback, deprecation admission rules, cache verification, serialized mutation races, public facade and package-boundary hygiene.
