# Runtime Web Render Model

Runtime Web does not render raw model/tool/customer data and does not trust a detached ComposedExperience artifact.

`prepareRenderModel` accepts:

- a ComposedExperience candidate;
- its source ExperiencePlan;
- a ComponentAdapterContract.

The composition is first validated against the source plan through Composer's integrity boundary. Every canonical Capability is then resolved through the exact Component Adapter mapping. Missing component mappings fail closed.

The resulting RenderModel contains only framework-neutral semantic data:

- plan ID and composition mode;
- semantic layout/disclosure policies;
- semantic regions;
- ordered capability + semantic component-reference bindings.

It contains no component implementation, props, task state, DomainData, HTML, DOM nodes, CSS, event listeners, callbacks, network requests, or executable code. A later Runtime Web renderer resolves approved component references to concrete host implementations.