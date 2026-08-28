# Composition Engine

Composition Engine combines a canonical ExperiencePlan with explicit Layout Policy and Disclosure Policy into a semantic composed artifact.

```text
ExperiencePlan
  -> Planner CompositionDirective
  -> semantic primary/supporting/deferred regions
explicit Layout Policy
explicit Disclosure Policy
  -> ComposedExperience
```

`ComposedExperience` contains:

- `planId` and planner semantic mode;
- explicit semantic layout family;
- one explicit semantic disclosure policy;
- non-empty semantic regions containing canonical capabilities.

The disclosure policy remains a single top-level source of truth. Regions carry their semantic role and do not duplicate effective disclosure values; consumers derive the applicable level from `disclosure[region.role]`.

The reference engine groups Planner's primary/supporting/deferred capability buckets into at most one region for each role. The underlying SemanticRegionSet contract still permits multiple same-role regions for future explicit composition strategies.

The engine does not carry task state or DomainData again, avoiding a second source of truth. Runtime state/plan remain the state owner. It also does not select components, generate DOM, execute actions, infer layout defaults, or make network/model calls.
