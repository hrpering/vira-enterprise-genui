# Active Phase

**Phase:** MASTER-36 — Design System / External Design Import  
**Status:** Q0–Q6 PASS / CORRECTED LOCAL Q7 REQUIRED  
**Base SHA:** `70194c6415c7b66c5f2569733b6ed1aa88b59832`  
**Frozen executable SHA:** `514f50e5a7c50bd8d93aecb63e401de5d5c9895a`  
**Previous:** MASTER-35 merged via PR #195  
**Next after merge:** MASTER-37 — Distribution / protocol program

MASTER-36 introduces `@vira-enterprise-genui/application-canvas-design-import` as a provider-neutral authoring import boundary.

External vendor adapters must normalize source material to DTCG 2025.10 before entering core. Canvas does not own Figma/Sketch/API payload parsing, URLs, credentials or provider bindings.

The import boundary validates the Canvas draft, requires the Application's existing exact `brandRef`, validates bounded source provenance, delegates token compilation to the canonical `design-system-compiler`, and returns a frozen `mode: "authoring-import"` artifact carrying canonicalized safe DTCG plus compiled Studio design options/metadata.

Q5 security review PASS. Exact input/source shapes reject provider/url/credential/apply/publish smuggling; raw DTCG is canonicalized with null-prototype objects before the existing compiler applies its own prototype-sensitive-name rejection. Compiler failures remain fail-closed and preserve compiler code/path.

Q6 architecture review PASS. Executable dependencies are only `application-canvas`, `design-system-compiler` and `protocol`. Full brand assembly remains with `studio-brand`; trusted renderer activation remains with `studio-brand-loader`; Canvas mutation/publish/deploy/runtime/governance/Action authority is unreachable.

First local Q7 on `2909dd596a54b6e6602b0ea38135cb2a243ef4e8` had package boundaries PASS, TypeScript PASS and the primary import suite 12/12 PASS. The three hardening tests all stopped earlier with `INVALID_DRAFT` because their fixture violated the canonical Application `EMPTY_APPLICATION` invariant. Production import code was not changed. The fixture now includes one inert exact Capability reference so the hardening tests reach the intended DTCG boundary; corrected frozen executable head is `514f50e5a7c50bd8d93aecb63e401de5d5c9895a`.

Hosted verify/iOS/Android jobs remain runner-allocation infrastructure non-signal when they contain no steps.

Merge remains blocked until exact corrected-head local Q7 and final executable-clean Q8.
