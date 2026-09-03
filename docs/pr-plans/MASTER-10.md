# MASTER-10 — Policy Simulation + Change Impact

## Responsibility

Make production policy changes reviewable before publish by evaluating the exact same bounded historical fixture set against the current and candidate policy revisions.

```text
Draft candidate
      ↓
Validate exact policy identity
      ↓
Historical fixtures (1..1000)
      ↓
Current evaluator ─┐
                   ├─ per-fixture old/new diff
Candidate evaluator┘
      ↓
new deny / new allow / changed effect
      ↓
Human review
      ↓
approved simulation evidence
      ↓
MASTER-11 publish may consume
```

## Invariants

1. Current and candidate must have distinct exact `policyRef` identities.
2. Both evaluators receive the same immutable fixture IDs and canonical inputs.
3. Fixture set is bounded to 1..1000 entries and fixture IDs are unique.
4. Evaluator exception or malformed normalized decision fails the simulation closed.
5. Supported normalized effects are `allow | deny | challenge | transform`.
6. Every fixture records current decision, candidate decision and exact diff classification.
7. A candidate `deny` where current was not `deny` is classified as `new-deny`.
8. Production approval cannot be generated until every `new-deny` fixture is explicitly acknowledged.
9. Rejected review is never publish-eligible.
10. Simulation does not execute actions, call protected adapters, or mutate production policy.
11. MASTER-10 produces review evidence only; deployment/promotion ownership remains MASTER-11.
12. Policy source/language is provider-neutral. AGT/OPA/Cedar/native evaluators can all adapt to the same normalized simulation contract.

## Report

The immutable V1 report binds:

```text
reportId
fixtureSetId
currentEvaluatorId
candidateEvaluatorId
currentPolicyRef
candidatePolicyRef
cases[]
summary
newDenyFixtureIds[]
```

`reportId` is a deterministic identity binding fixture-set + current policy ref + candidate policy ref. It is not a cryptographic artifact digest; signed/content-addressed deployment artifacts are MASTER-11 responsibility.

## Review

A review binds the exact report and policy refs and records:

```text
reviewerId
decision = approved | rejected
acknowledgedNewDenyFixtureIds[]
note?
publishEligible
```

Approval with unacknowledged new denies fails closed.

## Out of scope

- policy editor UI;
- policy language implementation;
- historical fixture collection/ledger persistence (MASTER-17);
- cryptographic artifact signing (MASTER-11);
- deployment/promotion/rollback (MASTER-11);
- organization/project approval roles (MASTER-12).

## Verification policy

Hosted CI is deferred. Final local/full CI must cover deterministic diffing, max/duplicate fixture bounds, evaluator failures, exact policy revision identity, new-deny acknowledgement, rejected-review behavior, public facade and package-boundary hygiene.
