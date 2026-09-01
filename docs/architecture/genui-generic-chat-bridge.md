# Generic GenUI Chat Bridge

The Chat integration owns one domain-neutral message contract: `vira_experience` with `present` and `command` operations. Chat does not inspect Experience domain names, component names, publication internals, or canonical Studio event/node identifiers.

```text
vira_experience present
        ↓
parse bounded canonical JSON message
        ↓
Experience Registry exact id + version lookup
        ↓
Pack entrypoint → studio-publication artifact
        ↓
ExperienceArtifactResolver
        ↓
canonical JSON publication dependency manifest
        ↓
immutable trusted Runtime Capability Registry
        ↓
exactly one covering runtime profile
        ↓
existing createViraExperienceRuntime()
        ↓
existing Studio runtime canonical recompile / host lifecycle
```

Runtime profiles are host-owned trusted bundles. A profile declares the `componentRefs`, `actionEvents`, and `bindingSources` it covers and prepares the existing GenUI runtime inputs, renderer registry, and trusted high-level command aliases. The generic resolver never switches on a Pack id or domain.

Profile selection fails closed when no profile covers all publication dependencies or when multiple profiles cover the same dependency set. This avoids hidden priority rules and domain-specific fallback behavior in the generic core.

`instanceId` is mandatory for both operations. `genui-chat` stores mounted experiences by exact `instanceId`; duplicate mounts and commands for unknown instances fail closed. There is no global latest/active Experience target.

The artifact resolver is an interface only. This package does not add network Registry transport, OCI/S3/CDN access, marketplace discovery, authentication, billing, or executable plugin loading.

Studio publication authenticity remains owned by the existing runtime. `createStudioRuntimeSession()` canonicalizes JSON, rebuilds through `prepareStudioPublication()`, and rejects forged publications before execution. The resolver only extracts dependency refs needed to select trusted host capabilities.
