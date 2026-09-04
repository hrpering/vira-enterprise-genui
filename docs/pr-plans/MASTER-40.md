# MASTER-40 — Application AI-host SDK

## Goal

Add a thin provider-neutral host-side SDK that verifies one canonical Application Distribution source, evaluates canonical host compatibility, and reports exact protocol-projection overlap without acquiring runtime, deployment, projection-adapter, governance or execution authority.

## Base

- authoritative `main`: `86def2e33f3f845fff8e3fb234099e60ffbdaf20`
- previous phase: MASTER-39 merged via PR #199
- branch: `master/40-application-ai-host-sdk`
- frozen executable head: `4b2350f9090d5b74e46f56a0478b12b25080ef3e`

## Existing owners

- `application-package` owns Application `hostCompatibility` and exact `protocolProjections[]` declarations.
- `application-distribution` owns source envelope validation and integrity verification.
- `application-protocol-projection` owns protocol projection artifacts/fidelity.
- runtime/deployment/governance/entitlement/Action owners retain their existing authority.

## New owner

`@vira-enterprise-genui/application-ai-host-sdk` owns only host-side compatibility ergonomics: strict host descriptor parsing, explicit source integrity-verifier delegation, canonical Vira-version min/max evaluation, required-host-capability subset evaluation, exact source/host protocol-projection intersection, and frozen compatibility-plan output.

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

Success means only that source integrity verification succeeded and the host satisfies canonical Application Vira-version/capability constraints. It is not a permission or execution receipt.

## Compatibility rules

- `host.viraVersion` is exact release semver;
- host capability IDs are canonical, unique and bounded;
- host protocol projection refs are canonical, exact, non-floating, unique and bounded;
- host version is inside canonical Application min/max Vira range;
- all canonical `requiredCapabilities[]` entries exist in host capabilities;
- compatible protocol projections are exact id+version intersection only;
- empty protocol intersection is allowed and does not itself imply runtime incompatibility;
- no implicit protocol selection or adapter invocation occurs.

## Q5 security / fail-closed review

PASS. See `docs/evidence/MASTER-40/REVIEW.md`.

- shared safe JSON boundary before inspection;
- invalid host rejected before external verifier invocation;
- exact root/host shapes reject authority-smuggling fields;
- bounded/unique host declarations;
- explicit Distribution integrity verification with literal success only;
- verifier/digest failures fail closed with caller-facing path normalization;
- unsafe accessor/custom-prototype inputs fail before verifier invocation;
- compatibility output is detached/frozen and exposes no execution/security authority.

## Q6 architecture / ownership review

PASS.

```text
application-ai-host-sdk → application-distribution, application-package, protocol
```

No dependency on projection adapter/fidelity implementation, registry/federation, deployment/runtime, governance/authorization/entitlement or Action execution owners. Canonical Application/Distribution owners remain unchanged.

## Q7 exact local verification

PASS — operator-reported against exact frozen executable head `4b2350f9090d5b74e46f56a0478b12b25080ef3e` for:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/application-ai-host-sdk.test.ts \
  tests/contract/application-ai-host-sdk-hardening.test.ts
```

Exact counts were not provided in the final green message and are not inferred. See `docs/evidence/MASTER-40/VERIFICATION.md`.

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main.
- Q1 PASS — targeted owner/roadmap reverse engineering.
- Q2 PASS — compatibility/non-authority contract frozen.
- Q3 PASS — implementation added.
- Q4 PASS — focused compatibility/integrity/security coverage added.
- Q5 PASS — final security/fail-closed review.
- Q6 PASS — final architecture/ownership review.
- Q7 PASS — exact frozen-head local boundaries/typecheck/focused tests, operator reported.
- Q8 PRE-Q7 PASS — actual executable scope reviewed; final post-Q7 executable-clean compare required.
- Q9 BLOCKED until final Q8; then exact-head squash merge and MASTER-41 federation starts from resulting new authoritative `main`.

Hosted verify/iOS/Android jobs on the frozen executable head ended with `steps: null` and remain infrastructure non-signal.