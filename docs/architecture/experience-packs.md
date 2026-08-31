# Experience Packs v1

Experience Packs are the distribution envelope for Vira experiences. They do not replace `StudioDocument`, `StudioPublication`, runtime plans, design contracts, or host application state.

## Boundary

`@vira-enterprise-genui/experience-packs` is dependency-free in v1. It owns only manifest validation, immutable canonicalization, artifact descriptors, compatibility metadata, and deterministic serialization.

A pack manifest contains references to content-addressed artifacts. It does not embed executable code, arbitrary HTML, JavaScript, JSX, CSS, credentials, secrets, unrestricted URLs, backend endpoints, or editor implementation state.

## Identity

Pack ids use `publisher/name` syntax. `publisher.id` must exactly match the namespace segment of the pack id. Pack and compatibility versions use release semver (`major.minor.patch`) in v1.

## Artifact model

Each artifact has:

- a unique bounded id;
- a semantic role;
- an allowlisted media type for that role;
- a lowercase `sha256:<64 hex>` content digest;
- a bounded non-negative integer size.

Entrypoints must reference artifacts whose role is `studio-publication`.

The initial role/media-type surface is deliberately narrow and fail-closed:

- `studio-publication`: canonical Vira `StudioPublication` encoded as standard `application/json`;
- `asset`: PNG, JPEG, WebP, or AVIF.

XP-001 does not mint Vira vendor MIME types for artifacts that do not already have canonical media-type contracts. Design bundles, component catalogs, experience metadata envelopes, and other future artifact kinds must first define their own canonical contracts before Experience Packs can advertise them.

Active content such as HTML, JavaScript, WebAssembly, SVG, shell content, or arbitrary binary media types is not accepted by the v1 contract.

## Distribution adapters

Registry transport is intentionally outside this package. A future registry adapter may map Experience Pack manifests and their content-addressed blobs to OCI artifacts. OCI/ORAS are implementation options, not Vira's canonical pack model.

A registry/runtime adapter that consumes a `studio-publication` artifact is responsible for parsing and validating the referenced JSON against the canonical Studio publication contract before execution. The dependency-free pack package intentionally does not duplicate that parser.

## Invariants

- unknown fields fail closed;
- parsed manifests are detached from input and deeply frozen;
- artifact and entrypoint ids are unique;
- publisher namespace parity is exact;
- entrypoints resolve only to `studio-publication` artifacts;
- compatibility ranges cannot be inverted;
- deterministic serialization sorts object keys while preserving array order;
- no registry, network, Studio, Puck, runtime, React, or telemetry dependency is permitted in the v1 package;
- pack v1 does not invent media-type contracts for future Vira subsystems.
