# ComposedExperience validation

`parseComposedExperience` is the strict shape/normalization boundary for Composer artifacts. `validateComposedExperienceAgainstPlan` is the stronger integrity boundary for downstream Runtime Web / SDK consumers that also have the source ExperiencePlan.

Shape parsing validates:

- `planId` using Protocol's ExperiencePlan identifier owner;
- `mode` using Planner's immutable composition-priority mode owner;
- layout and disclosure through their owning Composer policy validators;
- regions through SemanticRegionSet validation;
- minimal mode/region invariants.

Source-plan integrity additionally requires:

- artifact `planId` equals source plan ID;
- artifact mode equals Planner's directive for that plan;
- flattened primary/supporting/deferred capability identities and order exactly match Planner's directive.

This prevents a shape-valid artifact from injecting, dropping, or reclassifying semantic capabilities before rendering/adaptation.

Mode/region invariants remain deliberately minimal: `resolve` and `interact` require at least one primary region; `settled` may contain deferred regions only. No domain-specific mode/layout compatibility is inferred.

Both functions clone/freeze normalized output and do not restore task state/DomainData, select components, execute actions, or produce DOM/CSS.
