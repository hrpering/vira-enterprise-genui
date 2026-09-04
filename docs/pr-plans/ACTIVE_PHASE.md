# Active Phase

**Phase:** MASTER-36 — Design System / External Design Import  
**Status:** Q0–Q4 PASS / Q5–Q6 REVIEW IN PROGRESS  
**Base SHA:** `70194c6415c7b66c5f2569733b6ed1aa88b59832`  
**Previous:** MASTER-35 merged via PR #195  
**Next after merge:** MASTER-37 — Distribution / protocol program

MASTER-36 introduces `@vira-enterprise-genui/application-canvas-design-import` as a provider-neutral authoring import boundary.

External vendor adapters must normalize source material to DTCG 2025.10 before entering core. Canvas does not own Figma/Sketch/API payload parsing, URLs, credentials or provider bindings.

The import boundary validates the Canvas draft, requires the Application's existing exact `brandRef`, validates bounded source provenance, delegates token compilation to the canonical `design-system-compiler`, and returns a frozen `mode: "authoring-import"` artifact carrying safe raw DTCG plus compiled Studio design options/metadata.

The artifact has no apply/publish/deploy/execute or renderer-installation authority. Full brand assembly remains with `studio-brand`; trusted renderer activation remains with `studio-brand-loader`.

Merge remains blocked until Q5/Q6 security/architecture review, exact-head local Q7 and final executable-clean Q8.
