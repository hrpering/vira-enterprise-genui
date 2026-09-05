# MASTER-48 — Independent External Publisher Proof

**Status:** Q0–Q7 PASS / Q8 ACTIVE  
**Base SHA:** `6b79864e55209b52e5b984e671beaf69afdbfc84`  
**Frozen executable/test/boundary SHA:** `5f1c29773dd13d5328428e5933ec546259cb7b02`  
**Branch:** `master/48-external-publisher-proof`  
**PR:** #209 (draft)

## Goal

Prove that an independently named publisher consumer can use only Vira public package exports to prepare a canonical Application distribution envelope and enter exact public federation discovery without private source imports or hidden Vira authority.

## Q0–Q1 — repository truth

- `application-publisher-sdk` already owns publisher-side preparation only.
- `application-distribution` already owns the canonical Distribution envelope.
- `application-federation` already owns bounded public multi-source discovery and exact lookup.
- `application-package` owns canonical Application release id/version parsing.
- Therefore MASTER-48 does not create a new runtime/protocol/registry owner.

Q1 found one prerequisite owner drift: `application-federation` locally duplicated Application release semver validation. MASTER-48 remediates that by delegating query release semantics to `parseViraApplicationReleaseReference()`.

## Q2 — contract freeze

External proof composition:

```text
@acme/vira-external-publisher-proof
        ↓ public package export only
application-publisher-sdk
        ↓ canonical envelope
application-distribution
        ↓ public/discoverable only
application-federation
        ↓ exact id + exact release
lookup result + source provenance
```

Required invariants:

- no Vira `src/*` deep import from the external proof consumer;
- publisher assertion must exactly match canonical Application publisher;
- public federation rejects private, organization and non-discoverable releases;
- lookup is exact id+release only;
- no `latest`, omitted-version default, fallback or substitute release;
- same exact release with divergent canonical envelope fails closed;
- source IDs are provenance only, never trust/authentication/ranking;
- integrity digest is a declaration in the Distribution envelope, not verification;
- proof grants no authorization, entitlement, deployment or execution authority.

## Q3 — implementation

- added `examples/external-publisher-proof` as independent `@acme/...` workspace consumer;
- proof imports only `@vira-enterprise-genui/application-publisher-sdk` and `@vira-enterprise-genui/application-federation` public roots;
- added canonical `verify:external-publisher-proof` gate;
- aligned federation Application release query parsing with `application-package` owner API;
- declared the direct `application-package` dependency and package boundary.

## Q4 — focused/hardening tests

- `examples/external-publisher-proof/external-publisher-proof.test.ts`
- `tests/contract/application-federation-release-owner.test.ts`

Coverage includes end-to-end public preparation/discovery, publisher mismatch, visibility/discoverability, exact lookup/no fallback, federation conflict, provenance-vs-trust, and canonical release-owner parity.

## Q5–Q6

Static security/architecture review: PASS. See `docs/evidence/MASTER-48/Q5_Q6_REVIEW.md`.

## Q7

Operator-reported local PASS on exact freeze `5f1c29773dd13d5328428e5933ec546259cb7b02`. Evidence: `docs/evidence/MASTER-48/Q7_LOCAL_PASS.md`. No test counts or timings are reconstructed.

## Q8

ACTIVE. Independent PR reverse engineering must re-read current PR metadata/diff, executable files, public import boundaries, release-owner delegation, focused proof tests, reviews/threads/comments and hosted CI. Frozen-to-current executable drift must remain zero.

## Q9

Pending Q8 PASS: documentation-only closure compare, ready transition, exact-head squash merge and independent `main` verification.
