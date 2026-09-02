# Studio Experience v1 interoperability artifacts

This directory is generated/fixture material for the canonical `StudioExperienceDocument` owned by `packages/studio-schema`.

It is **not** a second Experience schema owner and it does not replace `parseStudioExperienceDocument(...)`.

- `schema/` is the structural/wire JSON Schema.
- `swift/` contains generated Foundation-only Codable models plus a compiler conformance harness.
- `kotlin/` contains generated Kotlin/JVM models, a self-contained JSON codec, and a compiler conformance harness.
- `fixtures/` contains domain-neutral cross-language fixtures.
- `SOURCE_DIGEST` binds committed generated output to the canonical TypeScript/protocol source files used by codegen.

Cross-field graph, uniqueness, scope-path and publication semantics remain authoritative in the canonical TypeScript semantic validator. Native host phases must preserve those semantics rather than treating successful model decoding as publication authority.
