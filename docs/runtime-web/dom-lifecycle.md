# Runtime Web DOM lifecycle

Runtime Web mounts a source-plan-validated RenderModel through an explicit trusted DOM Port. The lifecycle layer itself does not call `document`, dynamically import modules, interpret URLs, or turn semantic component references into executable code.

Mount now requires both semantic environment contracts:

- an explicit Accessibility Policy;
- an explicit container Responsive Policy.

The sequence is transactional:

1. validate composition against the source plan and resolve exact component references;
2. validate semantic accessibility policy;
3. validate container responsive policy;
4. ask the trusted DOM Port for the embedding container inline size;
5. deterministically resolve one semantic responsive band;
6. call `begin()` with validated render metadata + accessibility policy + resolved band;
7. create semantic regions and mount component bindings in order;
8. commit only after every mount succeeds.

If declarative validation fails, the DOM Port is not touched. If measurement throws or returns an invalid size, `begin()` is not called. If begin/region/component/commit throws, Runtime Web returns a fixed canonical failure, disposes every known mounted component in reverse order, and disposes the root. Raw host exception text is never returned.

A successful `MountedExperience.dispose()` remains idempotent and performs reverse-order component cleanup followed by root cleanup. Cleanup exceptions are contained so one broken component cannot prevent later cleanup attempts.

The host DOM Port is trusted executable integration code. It is responsible for implementing the supplied semantic accessibility policy and responsive band using approved local components/platform primitives; Runtime Web does not emit raw ARIA/CSS implementation values.
