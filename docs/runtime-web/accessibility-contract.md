# Runtime Web accessibility contract

Accessibility Policy is semantic runtime intent, not a DOM/ARIA configuration bag.

The MVP policy explicitly chooses:

- mount focus behavior: `preserve-host` or `first-primary`;
- update focus behavior: `preserve` or `primary-if-lost`;
- status announcements: `off` or `polite`;
- error announcements: `polite` or `assertive`.

Errors cannot be configured to `off`. The concrete browser/component host must later implement the semantic policy using accessible platform primitives.

`prepareAccessibleRenderModel` first executes the existing source-plan composition integrity and exact component-mapping boundary. Accessibility metadata therefore cannot be used to bypass RenderModel validation.

The contract contains no `aria-*` attributes, selectors, tabindex values, CSS, label strings, DOM nodes, event handlers, callbacks, or component implementations.
