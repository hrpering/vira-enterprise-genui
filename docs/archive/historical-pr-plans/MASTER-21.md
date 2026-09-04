# MASTER-21 — Private Enterprise Registry

Status: CODE-COMPLETE / FINAL-CI-PENDING after phase review.

## Goal

Provide an organization/project/environment-scoped approved catalog for Experiences, components, actions, policies, connectors, themes and Packs without replacing the existing canonical Experience Pack registry.

## Authority split

```text
Experience Pack manifest
        ↓
existing experience-registry
        ↓ exact id/version proof
private enterprise registry
        ↓
org / project / environment approval
```

## Invariants

- `experience-registry` remains the canonical Pack-manifest parse/lookup authority.
- The private enterprise registry stores approval identities, not executable source or arbitrary payloads.
- Approved entry schema has no HTML, JavaScript, code, body or generic payload field; unknown fields fail closed.
- Registry instances bind to one exact `ViraEnterpriseContext` scope.
- Entries cover `experience`, `component`, `action`, `policy`, `connector`, `theme` and `pack`.
- Non-Pack resource ids use the canonical semantic-namespace primitive.
- Pack id syntax is not duplicated; Pack approval succeeds only when exact id/version lookup succeeds in a canonical `ExperienceRegistrySnapshot`.
- Native component implementations require an explicit semantic `nativeCapabilityId` present in the registry's fixed allowlist.
- Unknown native capabilities fail closed.
- Exact duplicate resource identities are rejected.
- Registry entry count and native capability allowlist are bounded.
- Scope output is detached into a new frozen identity before it is retained by the registry.

## Verification scope

Focused contract coverage verifies scoped creation, exact approval/lookup, rejection of HTML/JS-shaped fields, unknown native capabilities, missing Pack manifests and unregistered environments. Full workspace and integration verification is intentionally deferred to the final MASTER-25 local gate requested by the repository owner.
