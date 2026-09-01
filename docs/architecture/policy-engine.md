# Policy Engine

Policy Engine is a provider-neutral decision boundary over the enforcement-oriented policies already owned by `@vira-enterprise-genui/security`.

It does not define a general rule language and it does not execute protected actions.

```text
policy check
    ↓
@vira-enterprise-genui/policy-engine
    ↓
closed domain routing
    ├─ capability → security capability allowlist
    ├─ component  → security component allowlist
    └─ network    → security network policy
    ↓
normalized allow / deny
    ↓
existing runtime/security enforcement
```

## Ownership

`security` remains the canonical owner of capability, component, and network policy syntax, validation, request/key validation, and domain allow/deny semantics. Policy Engine only normalizes how a caller asks for one of those existing decisions.

The wrapper input is deliberately small: `kind`, `policy`, and `target`. The successful result contains only `kind` and `decision`. It never echoes the policy, capability/component key, network URL, or arbitrary context.

Malformed policy/check input is an evaluation error, not a normal `deny`. Enforcement callers must fail closed on evaluation errors.

## V1 scope

Supported check kinds:

- `capability`
- `component`
- `network`

Content and CSP security surfaces are not routed in v1 because they do not expose the same stable allow/deny evaluator contract.

## Privacy and safety

The wrapper accepts no identity, tenant, user, session, prompt, message, arbitrary attribute, or metadata bag. Unknown wrapper fields fail closed without reflecting the rejected property name. Nested policy/target validation is delegated to the existing security owners, while Policy Engine normalizes their failures to fixed `$.policy` or `$.target` issue paths.

## Provider neutrality

OPA/Rego is not a core dependency. OPA's own architecture separates a Policy Decision Point from Policy Enforcement Points; Vira follows the same separation while keeping its canonical decision contract independent from OPA. A future OPA adapter may implement an external provider boundary without replacing Vira's canonical security contracts.
