# MASTER-46 — Q8 Independent Review Attempt 1

**Date:** 2026-09-05  
**Original frozen executable SHA:** `8a01eb001949327d1d34aaa780fd72f2687012ac`  
**Result:** FAIL — executable owner drift found

## Independent finding

Fresh PR reverse engineering found that `capability-supply` correctly delegated Capability serialization to `capability-contract`, but manually redefined Hosted Capability binding wire serialization through a local `serializeBinding()` helper.

That local helper duplicated the canonical binding fields:

```text
version
bindingRef
capabilityRef
providerId
locationId
```

Even though the output matched the current hosted binding parser, this violated the repository rule that one semantic noun has one canonical owner. A future hosted-binding contract change could otherwise drift from capability-supply conflict fingerprints or snapshot serialization.

## Remediation

The canonical owner `hosted-capability-runtime` now exposes:

```text
serializeViraHostedCapabilityBinding
```

The serializer reparses through `parseViraHostedCapabilityBinding` and serializes only the canonical parsed binding.

`capability-supply` now delegates both:

- cross-source binding conflict fingerprints;
- snapshot binding serialization;

to that canonical owner API. The local binding wire serializer was removed.

Focused coverage was added in:

```text
tests/contract/hosted-capability-binding-serialization.test.ts
```

covering deterministic roundtrip, malformed/floating binding rejection and accessor fail-closed behavior.

## Authority impact

The remediation does not broaden authority or dependency edges. `hosted-capability-runtime` already owns hosted binding parsing/execution semantics; adding canonical binding serialization completes that same owner surface. `capability-supply` becomes narrower by removing duplicated wire semantics.

## Freeze impact

The prior Q7 PASS on `8a01eb001949327d1d34aaa780fd72f2687012ac` is retained as historical evidence but is invalidated for final merge purposes because executable/test files changed after Q8.

New executable freeze candidate:

```text
b44f2363571f59369e450cf4571c27635709f2b9
```

Full Q7 must be rerun on that exact SHA before Q8 restarts.
