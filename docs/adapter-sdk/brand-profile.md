# Adapter SDK Brand Profile

Brand Profile is the framework-neutral identity contract an enterprise host can provide to Vira Enterprise GenUI before concrete components or CSS are involved.

The profile contains:

- a semantic brand `id`;
- a human-readable `displayName`;
- optional semantic token references for a small canonical set of brand roles.

Token references are **namespaced semantic identifiers**, not raw CSS values. They must contain at least two semantic segments, for example `acme.color.accent`. Values such as `red`, `serif`, `inherit`, `#4f46e5`, `16px`, a URL, a stylesheet, or executable code are not token references. Runtime Web/component adapters may later resolve approved references against the host application's design-token system.

MVP token roles are deliberately bounded: accent, surface, text, muted-text, border, body-font, heading-font, control-radius, and container-radius. Unknown roles fail closed instead of becoming an untyped style bag.

Brand Profile owns no DOM, CSS injection, font loading, remote assets, component implementation, runtime state, network calls, or customer business data.
