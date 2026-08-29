# Flight Search MVP Browser Demo

This example exercises the public Vira Enterprise GenUI MVP path in a browser without adding a frontend framework or bundler.

## Run

From the repository root:

```bash
pnpm install
pnpm demo:flight-search
```

Then open:

```text
http://127.0.0.1:4173/examples/flight-search-demo/
```

The command builds the workspace with the repository TypeScript build and starts a dependency-free Node static server. The browser uses an import map to load the emitted workspace packages from `.build/`.

## What is real

The demo uses the public package surfaces for:

```text
host intent + state
      ↓
Planner
      ↓
Composer
      ↓
Adapter SDK component mapping
      ↓
Security allowlists
      ↓
createViraGenUI / Runtime Web
      ↓
canonical user action
      ↓
explicit host boundary
      ↓
network policy evaluation
      ↓
provider-neutral mock tool result
      ↓
Tool Bridge → DomainData
      ↓
runtime.patch.apply
      ↓
Runtime statechange
      ↓
brand results component
      ↓
Telemetry channel → host exporter
```

The flight backend itself is intentionally mocked. Vira does not execute the network request or own the business backend; the host receives the canonical action and owns execution.

## Security behavior shown

- exact capability allowlist;
- exact component allowlist;
- explicit action permission policy;
- deny-by-default test through the **Test denied action** button;
- exact HTTPS origin + HTTP method network authorization;
- structured tool-result normalization before data enters Runtime state;
- results render from the canonical Runtime state snapshot, not directly from provider output;
- provider/business execution remains outside the GenUI runtime.

## Verification status

This example is included by the repository TypeScript build because `examples/**/*.ts` is already part of `tsconfig.build.json`.

The repository release criterion remains unchanged: `pnpm verify` must execute successfully in CI or an equivalent trusted environment. A GitHub-hosted runner allocation failure is not a passing verification result.
