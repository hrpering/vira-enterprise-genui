# CSP host requirements

Vira Enterprise GenUI does not own the host application's Content Security Policy header. The Security package exposes immutable **minimum requirements** that a host integration can translate into its existing CSP configuration.

```text
validated NetworkPolicy
        |
        v
CspHostRequirements
        |
        +-- script-src: forbid 'unsafe-inline', 'unsafe-eval'
        +-- script-src-attr: deny-all
        +-- object-src: deny-all
        +-- connect-src: require Vira network origins
```

The contract deliberately does not parse, merge, serialize, or install CSP headers or `<meta>` elements. Server/framework ownership remains with the enterprise host.

`connectSrc.origins` is a **required subset**, not a complete host allowlist. A host may need additional origins for its own application. Vira's NetworkPolicy remains the runtime authorization owner for exact origin + HTTP method decisions; CSP `connect-src` cannot express that method-level distinction.

The requirements are deterministic and deeply immutable. Network origins are first validated/canonicalized by the Security NetworkPolicy owner and then sorted before being exposed as CSP requirements.

This contract does not introduce inline-script exceptions, nonces, hashes, report endpoints, framework middleware, or a general-purpose CSP policy builder. Those remain host concerns unless a later scoped integration requires them.
