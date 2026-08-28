# Runtime Web DOM lifecycle

Runtime Web mounts a validated RenderModel through an explicit trusted DOM Port. The lifecycle layer itself does not call `document`, dynamically import modules, interpret URLs, or turn semantic component references into executable code.

The DOM Port is the host/browser integration boundary. It receives only source-plan-validated semantic metadata and exact component references that already passed the Component Adapter.

Mount is transactional from Runtime Web's perspective:

1. prepare and integrity-check the RenderModel;
2. begin a host root;
3. create semantic regions in order;
4. mount component bindings in order;
5. commit only after every mount succeeds.

If begin/region/component/commit throws, Runtime Web returns a fixed canonical failure, disposes every known mounted component in reverse order, and disposes the root. Raw host exception text is never returned.

A successful `MountedExperience.dispose()` is idempotent and performs reverse-order component cleanup followed by root cleanup. Cleanup exceptions are contained so one broken component cannot prevent later cleanup attempts.

The host DOM Port is trusted executable integration code. It should resolve semantic component references from a pre-approved local registry; Runtime Web never provides an import path or remote URL.