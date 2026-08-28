# Disclosure Policy

Disclosure Policy decides semantic visibility level by semantic region role without selecting a UI widget or interaction implementation.

Levels are:

- `immediate`: available in the current primary surface;
- `progressive`: available after normal progressive disclosure;
- `on-demand`: available only when explicitly requested/opened;
- `hidden`: intentionally not surfaced in the current experience state.

MVP semantic safety rules are asymmetric:

- `primary` must always be `immediate`; current task blockers/primary interactions cannot be hidden behind disclosure.
- `supporting` may be `immediate`, `progressive`, or `on-demand`, but not fully hidden.
- `deferred` may be `progressive`, `on-demand`, or `hidden`, but cannot masquerade as immediate priority.

Every role requires an explicit decision; there are no hidden defaults.

The policy does not prescribe accordion widgets, truncation, animation, max-lines, DOM visibility, breakpoints, components, or CSS. Runtime Web and component adapters later implement the chosen semantic disclosure behavior accessibly.
