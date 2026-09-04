# MASTER-26 — Application Semantic Freeze

## Goal

Freeze the meaning, authority, lifecycle and version model of Vira Application semantics before any Application Network implementation begins.

## Base

- authoritative `main`: `e566ea2ee1d3794a3c23585323a48741de140eab`
- entering state: Enterprise GenUI RC1 closed by MASTER-25R
- phase branch: `master/26-application-semantic-freeze`

## Scope

MASTER-26 is intentionally **documentation/semantic only**.

Deliverables:

```text
APPLICATION_MODEL.md
APPLICATION_AUTHORITY.md
APPLICATION_LIFECYCLE.md
APPLICATION_VERSION_MODEL.md
```

Supporting phase/status/reverse-engineering records may also change.

## Explicit non-scope

Do not add in MASTER-26:

- `ViraApplicationPackage` executable TypeScript/Kotlin/Swift schema;
- Application registry/resolver/runtime package;
- Canvas implementation;
- Network/distribution implementation;
- Capability provider implementation;
- WorkContext persistence;
- new Action/governance authority;
- package-boundary changes;
- dependency changes;
- speculative migration of existing Experience/Pack/Studio contracts.

## Q0 — Baseline

Freeze exact post-RC1 `main` SHA and current owner map.

PASS criterion: phase branch starts exactly from `e566ea2ee1d3794a3c23585323a48741de140eab`.

## Q1 — Reverse engineering

Read existing constitutional/owner surfaces before defining Application semantics:

- `MASTER_PLAN.md`
- `docs/strategy/APPLICATION_NETWORK_THESIS.md`
- `PACKAGE_OWNERSHIP.md`
- `PLATFORM_MODEL.md`
- `studio-schema` / `studio-compiler` / `studio-publish`
- Experience Pack / registry / resolver / deployment owners
- runtime / governance / Action Boundary / enterprise context owners

Key expected finding: Application is a higher-order composition referencing existing owners, not a replacement for them.

## Q2 — Semantic authority freeze

Freeze:

- what Application owns;
- what it explicitly does not own;
- relationship to Experience/Capability/Context/Action;
- Canvas and Network authority limits;
- provider-neutrality and exact-resolution invariants.

## Q3 — Documentation implementation

Create the four constitutional Application documents and update active plan/status records only.

## Q4 — Focused verification

Because MASTER-26 changes no executable code, verify documentation consistency rather than inventing synthetic runtime tests:

- no new package/source/sdk files;
- no dependency manifests changed;
- no executable boundary graph changed;
- no duplicate semantic owner introduced;
- terminology is consistent across all four documents.

## Q5 — Security review

Confirm the freeze preserves:

- exact identity/version resolution;
- fail-closed ambiguous/missing authority;
- enterprise scope/governance/Action Boundary precedence;
- no entitlement = authorization conflation;
- no provider/network/canvas bypass.

## Q6 — Architecture review

Confirm Application composes existing owners and does not become a workflow engine, runtime fork, policy engine, registry clone or provider framework.

## Q7 — Repository verification

No executable content changes are expected. Diff verification is the required gate; repository-wide executable CI need not be rerun solely for documentation-only changes unless the diff unexpectedly touches executable paths.

## Q8 — Independent PR reverse engineering

Review actual PR diff against this scope. Any executable/schema/package implementation discovered in the diff is a phase blocker and must be removed or deferred.

## Q9 — Merge

Squash merge only after Q0–Q8 are green. Fetch new authoritative `main` and only then start MASTER-27.

## Frozen invariants

```text
Application = higher-order semantic composition
Experience ≠ Application
Pack ≠ Application
Deployment ≠ Application
Runtime instance ≠ Application
Canvas ≠ semantic authority
Network ≠ execution authority
Provider ≠ canonical semantic owner
Entitlement ≠ authorization
Published Application release = immutable
Execution = exact resolved identities, never implicit latest
```
