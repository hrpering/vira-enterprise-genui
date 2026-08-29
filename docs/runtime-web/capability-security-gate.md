# Runtime Web capability security gate

Render capability authorization is explicit and fail-closed.

```text
composition + source plan + component adapter
                    |
                    v
              RenderModel
                    |
                    v
   exact CapabilityAllowlistPolicy
                    |
           all bindings allowed?
              /             \
            no               yes
            |                 |
  CAPABILITY_DENIED           v
     DOM calls = 0       responsive/DOM lifecycle
```

A Component Adapter mapping answers **how an authorized semantic capability is implemented**. It is not permission. Runtime Web therefore builds and integrity-validates the RenderModel first, then checks every canonical `binding.capability.id` against the required Security allowlist.

The check aborts the entire mount. Runtime Web never silently removes an unauthorized region or component, because partial rendering would change task semantics and could hide required controls/disclosures.

This gate is separate from Runtime Core action permissions. A capability being render-authorized does not mean every action it may emit is permitted; Runtime Core still evaluates canonical actions against its own permission policy.

The public Web SDK requires `capabilityAllowlist`; there is no allow-all default. Direct `mountExperience()` also revalidates and enforces the policy, so callers cannot bypass the security gate by skipping the SDK wrapper.
