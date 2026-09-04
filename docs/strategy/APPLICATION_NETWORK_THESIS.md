# Vira Application Network Thesis

## Product constitution

```text
VIRA CANVAS
    ↓
VIRA RUNTIME
    ↓
VIRA NETWORK

Build → Run → Distribute
```

**Canvas** authors application semantics.  
**Runtime** executes the same canonical semantics across Web, iOS, Android, embedded and conversational surfaces.  
**Network** distributes applications and capabilities to human and AI demand surfaces.

The repository roadmap exists to realize this product structure without turning Vira into a collection of competing primitives.

## Core semantic direction

The Application Network composes five semantic families:

- **Experience** — the human-facing governed UI semantics already owned by the existing Experience/Studio foundation.
- **Capability** — provider-neutral invocable functionality.
- **Context** — bounded work-state, artifacts, evidence, results, decisions, receipts and provenance.
- **Action** — governed effects that remain behind the existing Action Boundary and governance owners.
- **Application** — a higher-order package/graph that references those exact identities without replacing them.

## What Vira is building

Vira's durable boundary is the governed application layer between AI intent and real product execution:

```text
AI / human demand
      ↓
application discovery / semantics
      ↓
native Experience + capability invocation
      ↓
context + governance
      ↓
Action Boundary
      ↓
enterprise backend / provider
```

Canvas is not a Figma/Canva clone. Runtime is not an agent framework. Network is not a cloud-compute or generic marketplace engine. Protocols and providers are composable supply/demand surfaces around Vira's canonical semantics.

## Ecosystem principle

Vira should become **more useful** when adjacent ecosystems improve:

- better A2UI/AG-UI/MCP-style protocols give Vira better projection and interop targets;
- better design systems and design tools give Canvas better supply;
- better governance systems give Vira better governance providers;
- better AI/agent hosts create more distribution demand;
- better capability providers create more execution supply.

If an external ecosystem implementing a primitive well would erase Vira's value, that primitive is not Vira's core moat.

## Product prohibitions

Core does not become:

- a foundation model,
- a generic agent framework,
- a generic workflow engine,
- a policy language or OPA/Rego/Cedar clone,
- an OAuth/integration empire,
- an MCP/A2UI replacement,
- a generic IDE,
- a Figma/Canva clone,
- generic cloud compute,
- a consumer ChatGPT clone,
- premature ads infrastructure,
- a catalog of thousands of unverified OSS applications.

## Roadmap shape

1. Freeze application semantics and exact ownership.
2. Build application-level Canvas on existing owners.
3. Add protocol egress, publisher/AI-host SDKs and federated distribution.
4. Add entitlement, metering, hosted capability execution and marketplace economics without conflating commercial access with security permission.
5. Prove the network with independent external publishers, AI hosts, providers and cross-surface exact semantics.

Engineering status, exact active phases and merge gates live in `MASTER_PLAN.md`; this thesis intentionally does not duplicate repository status.
