# MASTER-51 — Q8 Attempt 1 — Capability Release Owner Drift

**Date:** 2026-09-05  
**Phase:** MASTER-51 — Cross-Surface Exact Semantics + Application Network RC  
**Q8 result:** FAIL — executable owner drift found  
**Previously frozen executable/config SHA:** `952e3445d46d0b3770a499522abc1ad77315a228`

## Finding

Independent Q8 re-read found that Capability release identity (`Capability id + exact release semver`) was implemented twice:

- `capability-contract` validated `ViraCapabilityDefinition.id/version` with its local release-semver implementation;
- `capability-supply` independently validated `capabilityId/capabilityVersion` query fields with another local `RELEASE_VERSION` regex.

This violates the repository invariant that one semantic concept has one canonical owner. It is the same class of owner drift previously remediated for Application exact/release identity.

## Consequence

Q8 attempt 1 failed. PR #212 was not merged.

The operator-reported final Q7 PASS on `952e3445d46d0b3770a499522abc1ad77315a228` remains historical evidence but cannot authorize final merge after executable changes required by this finding.

## Remediation

The fix is intentionally narrow:

1. `capability-contract` now owns a public canonical Capability release-reference API:
   - `parseViraCapabilityReleaseReference()`;
   - `serializeViraCapabilityReleaseReference()`.
2. `parseViraCapabilityDefinition()` delegates its root `id/version` release identity to that same owner API.
3. `lookupViraCapabilitySupply()` removes its local release-semver parser and delegates query `capabilityId/capabilityVersion` to the canonical owner, mapping only owner issue paths into the supply query path namespace.
4. `tests/contract/capability-release-reference-owner.test.ts` locks direct parser ↔ CapabilityDefinition ↔ CapabilitySupply query parity and accessor fail-closed behavior.
5. `verify:application-network-cross-surface` includes the new owner-parity test.

No new package, provider-selection rule, runtime authority, Action behavior, authentication, entitlement, deployment or generic cloud-compute semantic is introduced.

## New freeze candidate

After executable/test remediation, the candidate executable/test/config freeze is:

`a3ba23a68f68aee894f818823ba1003511024f19`

Q5/Q6 must be re-reviewed on this SHA. A fresh Q7 run is required before Q8 may restart.
