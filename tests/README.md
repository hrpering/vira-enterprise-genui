# Test architecture

Tests are organized by contract boundary rather than by implementation detail.

- `helpers/` contains deterministic, framework-neutral test primitives.
- `fixtures/` contains explicit serialized inputs/outputs used by contract tests.
- Future `contract/`, `integration/`, `security/`, and `e2e/` suites must test public behavior at the narrowest useful boundary.

## Rules

- Tests must not depend on wall-clock time, random UUIDs, external network access, or customer-specific services unless an integration test explicitly declares that dependency.
- Golden fixtures must be human-readable and versioned.
- A test should fail when the contract is violated, not merely when internal implementation structure changes.
- Fake adapters are introduced only after the corresponding adapter contract exists; the test harness does not invent production interfaces.
