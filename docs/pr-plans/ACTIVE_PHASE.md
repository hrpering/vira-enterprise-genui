# Active Phase

**Phase:** MASTER-36 — Design System / External Design Import  
**Status:** Q0–Q8 PASS / Q9 READY TO MERGE  
**Base SHA:** `70194c6415c7b66c5f2569733b6ed1aa88b59832`  
**Frozen executable SHA:** `514f50e5a7c50bd8d93aecb63e401de5d5c9895a`  
**Previous:** MASTER-35 merged via PR #195  
**Next after merge:** MASTER-37 — Distribution / protocol program

MASTER-36 introduces `@vira-enterprise-genui/application-canvas-design-import` as a provider-neutral authoring import boundary.

External vendor adapters must normalize source material to DTCG 2025.10 before entering core. Canvas does not own Figma/Sketch/API payload parsing, URLs, credentials or provider bindings.

The import boundary validates the Canvas draft, requires the Application's existing exact `brandRef`, validates bounded source provenance, delegates token compilation to the canonical `design-system-compiler`, and returns a frozen `mode: "authoring-import"` artifact carrying canonicalized safe DTCG plus compiled Studio design options/metadata.

Q5 security review PASS. Exact input/source shapes reject provider/url/credential/apply/publish smuggling; raw DTCG is canonicalized with null-prototype objects before the existing compiler applies its own prototype-sensitive-name rejection. Compiler failures remain fail-closed and preserve compiler code/path.

Q6 architecture review PASS. Executable dependencies are only `application-canvas`, `design-system-compiler` and `protocol`. Full brand assembly remains with `studio-brand`; trusted renderer activation remains with `studio-brand-loader`; Canvas mutation/publish/deploy/runtime/governance/Action authority is unreachable.

First local Q7 on `2909dd596a54b6e6602b0ea38135cb2a243ef4e8` exposed a test-fixture defect: package boundaries and TypeScript passed, the primary suite passed 12/12, but the hardening fixture violated canonical Application `EMPTY_APPLICATION` and stopped with `INVALID_DRAFT` before DTCG import. Production import code was unchanged. The fixture was corrected by adding one inert exact Capability reference.

Corrected exact-head local Q7 on `514f50e5a7c50bd8d93aecb63e401de5d5c9895a` is operator-reported PASS: package boundaries PASS, TypeScript PASS, 2/2 test files PASS, 15/15 tests PASS (hardening 3/3; primary import 12/12).

Q8 PASS. Final compare from corrected frozen executable head `514f50e5a7c50bd8d93aecb63e401de5d5c9895a` to the closure branch state contains only verification evidence and phase/status documentation; executable drift is zero.

Hosted verify/iOS/Android jobs remain runner-allocation infrastructure non-signal when they contain no steps.

MASTER-36 is ready for exact-head squash merge. MASTER-37 must start from the resulting new authoritative `main`, never from this phase branch.
