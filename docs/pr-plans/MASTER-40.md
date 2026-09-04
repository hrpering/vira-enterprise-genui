# MASTER-40 — Application AI-host SDK

## Goal

Add a thin provider-neutral host-side SDK that verifies one canonical Application Distribution source, evaluates canonical host compatibility, and reports exact protocol-projection overlap without acquiring runtime, deployment, projection-adapter, governance or execution authority.

## Base

- authoritative `main`: `86def2e33f3f845fff8e3fb234099e60ffbdaf20`
- previous phase: MASTER-39 merged via PR #199
- branch: `master/40-application-ai-host-sdk`

## Existing owners

- `application-package` owns Application `hostCompatibility` and exact `protocolProjections[]` declarations.
- `application-distribution` owns source envelope validation and integrity verification.
- `application-protocol-projection` owns protocol projection artifacts/fidelity.
- runtime/deployment/governance/entitlement/Action owners retain their existing authority.

## New owner

`@vira-enterprise-genui/application-ai-host-sdk` owns only host-side compatibility ergonomics:

- strict safe host descriptor parsing;
- explicit source integrity-verifier delegation;
- canonical Vira version min/max evaluation;
- required host capability subset evaluation;
- exact source/host protocol-projection intersection;
- frozen compatibility-plan output.

It does not own authentication, host identity proof, URLs/endpoints/transports, registry/federation, provider credentials, protocol adapter execution, projection artifact generation, deployment/runtime state, governance/authorization/entitlement, Capability invocation or protected Action execution.

## Contract

```text
evaluateViraApplicationForAiHost(
  {
    source,
    host: {
      viraVersion,
      capabilities,
      protocolProjections
    }
  },
  integrityVerifier
)
```

Success:

```text
{
  sdkVersion: "1",
  source,
  host,
  compatibleProtocolProjections
}
```

Success means only that source integrity verification succeeded and the host satisfies canonical Application Vira-version/capability constraints. It is not a permission or execution receipt.

## Compatibility rules

- `host.viraVersion` must be exact release semver;
- host capability IDs must be canonical, unique and bounded;
- host protocol projection refs must be canonical, exact, non-floating, unique and bounded;
- host version must be >= Application `minViraVersion` and <= optional `maxViraVersion`;
- every canonical `requiredCapabilities[]` entry must exist in host capabilities;
- `compatibleProtocolProjections[]` is exact id+version intersection only;
- empty protocol intersection is allowed and does not itself imply runtime incompatibility;
- no implicit protocol selection or adapter invocation occurs.

## Trust / authority rules

- full input passes shared safe JSON boundary before inspection;
- invalid host data fails before external verifier invocation;
- source verification delegates to `application-distribution` and literal verifier success is required;
- integrity verification is not authentication, authorization, entitlement, governance approval or deployment approval;
- compatibility success grants no runtime or protected-effect authority;
- no URL/endpoint/transport/credential/registry/federation fields are accepted;
- unsafe accessors/custom prototypes fail closed.

## Package boundary

```text
application-ai-host-sdk → application-distribution, application-package, protocol
```

## Focused verification

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/application-ai-host-sdk.test.ts \
  tests/contract/application-ai-host-sdk-hardening.test.ts
```

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main.
- Q1 PASS — targeted owner/roadmap reverse engineering.
- Q2 PASS — compatibility/non-authority contract frozen.
- Q3 PASS — implementation added.
- Q4 PASS — focused compatibility/integrity/security coverage added.
- Q5 REQUIRED — final security/fail-closed review.
- Q6 REQUIRED — final architecture/ownership review.
- Q7 REQUIRED — exact-head local boundaries/typecheck/focused tests.
- Q8 REQUIRED — actual PR diff review + final post-Q7 executable-clean compare.
- Q9 BLOCKED until Q7/Q8; then exact-head squash merge and MASTER-41 federation starts from resulting new authoritative `main`.
