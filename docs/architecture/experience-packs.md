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

Entrypoints must reference artifacts whose role is `experience`.

The initial role/media-type surface is deliberately fail-closed:

- `experience`: canonical Vira Studio publication JSON only;
- `design`: Vira design bundle JSON;
- `catalog`: Vira component catalog JSON;
- `metadata`: Vira experience metadata JSON;
- `asset`: PNG, JPEG, WebP, or AVIF.

XP-001 does not invent a second generic experience payload format. Active content such as HTML, JavaScript, WebAssembly, SVG, shell content, or arbitrary binary media types is not accepted by the v1 contract.

## Distribution adapters

Registry transport is intentionally outside this package. A future registry adapter may map Experience Pack manifests and their content-addressed blobs to OCI artifacts. OCI/ORAS are implementation options, not Vira's canonical pack model.

## Invariants

- unknown fields fail closed;
- parsed manifests are detached from input and deeply frozen;
- artifact and entrypoint ids are unique;
- publisher namespace parity is exact;
- entrypoints resolve to canonical Studio publication artifacts;
- compatibility ranges cannot be inverted;
- deterministic serialization sorts object keys while preserving array order;
- no registry, network, Studio, Puck, runtime, React, or telemetry dependency is permitted in the v1 package.
