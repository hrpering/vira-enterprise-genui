# MASTER-51 — Cross-Surface Exact Semantics + Application Network RC

**Status:** Q0–Q6 PASS / Q7 RERUN PENDING / Q8 BLOCKED  
**Base SHA:** `6f02e4437210c0cd662f1852759c88fca328462c`  
**Frozen executable/test/config SHA:** `a3ba23a68f68aee894f818823ba1003511024f19`  
**Invalidated previous freeze:** `952e3445d46d0b3770a499522abc1ad77315a228`  
**Earlier invalidated freeze:** `0c4913931d8fcc19f5e3676be4e3ea9c4a84b67f`  
**Branch:** `master/51-network-rc`  
**PR:** #212 (draft)

## Goal

Close the Application Network roadmap by proving one exact semantic chain across publisher, federation, AI-host compatibility, Capability supply and hosted query execution, then compose all existing Enterprise + Network verification gates into one fail-closed Application Network RC command.

MASTER-51 remains a closure/integration phase, not a new semantic package or owner.

## Canonical cross-surface chain

```text
external publisher
        ↓
application-publisher-sdk
        ↓ canonical Distribution
application-federation exact lookup
        ↓
application-ai-host-sdk
        ↓ explicit Distribution integrity verification
canonical Application.capabilities exact reference
        ↓
capability-supply exact provider/location lookup
        ↓
hosted-capability-runtime one-shot query execution
        ↓
execution evidence with the same exact Capability id@version
```

## Application Network RC

```text
verify:application-network-rc
  ├─ verify:enterprise-rc
  ├─ verify:external-publisher-proof
  ├─ verify:external-ai-host-proof
  ├─ verify:external-provider-proof
  └─ verify:application-network-cross-surface
```

The RC orchestrator owns no semantic truth and fails immediately when a child gate fails.

## Core implementation and coverage

MASTER-51 integration/release surfaces:

- `examples/application-network-rc/package.json`;
- `examples/application-network-rc/application-network-rc.test.ts`;
- `examples/application-network-rc/application-network-rc-hardening.test.ts`;
- `tooling/verify-application-network-rc.mjs`;
- root `verify:application-network-cross-surface` and `verify:application-network-rc` scripts.

Coverage proves exact Application discovery, explicit Distribution integrity verification, exact protocol compatibility, direct Application Capability `id@version` → Capability supply lookup, no provider fallback/substitution, one-shot hosted execution, exact execution evidence identity, binding mismatch rejection, Action Boundary rejection, floating Application Capability rejection before digest generation, and absence of invented auth/trust/commercial/deployment authority.

## Q7 history before Q8 attempt 1

- `0c491393...`: Q7 attempt 1 exposed MASTER-51 typecheck + inherited lint blockers and required executable/config remediation.
- `952e3445...`: Q7 attempt 2 passed code/repository gates but was environment-blocked because local `xcrun` used standalone Command Line Tools.
- same `952e3445...`: after full Xcode environment repair, operator reported final Application Network RC **green**.

Evidence:

- `docs/evidence/MASTER-51/Q7_ATTEMPT_1_FAIL.md`;
- `docs/evidence/MASTER-51/Q7_ATTEMPT_2_ENV_BLOCKED.md`;
- `docs/evidence/MASTER-51/Q7_FINAL_PASS.md`.

That final Q7 PASS is now historical only because independent Q8 found an executable owner issue.

## Q8 attempt 1 — FAIL

Independent Q8 re-read found duplicate Capability release identity validation:

- `capability-contract` validated CapabilityDefinition `id/version` with its own release-semver implementation;
- `capability-supply` separately validated supply query `capabilityId/capabilityVersion` with another local `RELEASE_VERSION` parser.

This violated the one-semantic-concept/one-owner invariant.

Evidence: `docs/evidence/MASTER-51/Q8_ATTEMPT_1_OWNER_DRIFT.md`.

PR #212 was not merged.

## Q8 remediation

The existing canonical Capability owner was extended rather than creating a new package:

- added `parseViraCapabilityReleaseReference()`;
- added `serializeViraCapabilityReleaseReference()`;
- `parseViraCapabilityDefinition()` now delegates root `id/version` release identity to that API;
- `lookupViraCapabilitySupply()` removes its local release-semver parser and delegates supply query release identity to the same owner;
- supply maps only owner issue paths to `$query.capabilityId` / `$query.capabilityVersion`;
- `tests/contract/capability-release-reference-owner.test.ts` locks direct parser ↔ CapabilityDefinition ↔ supply-query parity and accessor fail-closed behavior;
- `verify:application-network-cross-surface` now includes that owner-parity suite.

No new dependency edge is required because `capability-supply` already depends on `capability-contract`.

No provider-selection, Action, authentication, entitlement, deployment or cloud-compute authority is added.

## Q5–Q6 after remediation

Static security/architecture review repeated and PASS on:

`a3ba23a68f68aee894f818823ba1003511024f19`

Evidence: `docs/evidence/MASTER-51/Q5_Q6_REVIEW.md`.

## Current Q7 requirement

A full local Q7 rerun is required on exact detached SHA:

`a3ba23a68f68aee894f818823ba1003511024f19`

The previous final green on `952e3445...` cannot authorize merge because executable/test content changed after Q8 attempt 1.

Q8 remains blocked until the new freeze passes locally.

## Q8–Q9 after rerun PASS

- restart independent Q8 from scratch;
- inspect current PR metadata/diff and canonical adjacent owners;
- inspect reviews/threads/comments;
- classify current-head hosted Actions;
- prove new freeze → closure executable/package/test/boundary/config drift is zero;
- if Q8 PASS, perform final Q9 docs-only closure compare;
- mark PR ready and squash merge only with fresh exact `expected_head_sha`;
- independently verify resulting authoritative `main` and close the Application Network roadmap.
