# Semantic regions

Composer semantic regions group canonical capabilities by semantic priority without deciding visual layout.

MVP roles are deliberately limited to:

- `primary`: capabilities that deserve current task focus;
- `supporting`: currently relevant but secondary capabilities;
- `deferred`: capabilities known to the experience but not currently prioritized.

These are **not visual slots**. A `primary` semantic region does not mean a particular grid column, card, panel, or DOM container. Layout Policy owns visual structure later.

Each non-empty region has a semantic `id`, a role, and canonical Capability values. Region IDs and capability identities must be unique across a set. Total capabilities cannot exceed ExperiencePlan's canonical capability limit.

The contract intentionally does not introduce header/action/detail/data regions before those concepts have owning contracts. It also carries no components, props, styles, actions, endpoints, brand tokens, DOM nodes, or network behavior.
