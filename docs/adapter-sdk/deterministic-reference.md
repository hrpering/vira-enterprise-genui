# Adapter SDK deterministic reference gate

The Adapter SDK phase is intentionally declarative and deterministic. Its reference path is:

```text
Brand Profile
Intent Alias Adapter -> canonical Intent
Experience Recipe -> exact intent match
Domain Adapter -> canonical DomainData membership
Data Adapter -> explicit top-level projection
Component Adapter -> semantic component reference
Action Adapter -> semantic { type, payload } descriptor
Policy Adapter -> semantic composition-policy references
```

No stage calls a model, network, tool, DOM API, module loader, callback, permission engine, or customer endpoint. No Adapter SDK module can mint RuntimeAction identity/source or grant authorization.

`tests/fixtures/adapter-sdk/golden-integrations.v1.json` freezes representative travel and support integrations. The integration test verifies exact outputs, deterministic JSON round-trips, frozen values, and fail-closed boundary behavior.

These fixtures are integration contracts, not customer implementations. They contain no secrets, URLs, raw CSS, component code, prompts, or executable callbacks.