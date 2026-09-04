# MASTER-47 — Q8 Attempt 1

**Date:** 2026-09-05  
**Original frozen executable SHA:** `25ee1c25223863f3ceeb53210142acd1da331405`  
**Result:** FAIL — executable owner-implementation drift found

## Finding

Independent Q8 reverse engineering found that MASTER-47 exposed a new public canonical Application exact-reference parser/serializer in `packages/application-package/src/reference.ts`, while `packages/application-package/src/validate.ts` still retained a separate implementation of the same exact-reference validation rules (`VERSION_REF`, floating aliases/range rejection and `parseExactReference`).

Both implementations lived inside the same canonical owner package and currently accepted the same intended language, but maintaining two semantic implementations for one canonical noun creates drift risk. The owner-local API extension therefore had not yet achieved a single implementation boundary.

## Remediation

- `parseViraApplicationExactReference` remains the single owner-local exact-reference parser implementation;
- the package validator now delegates exact references to that parser;
- the validator retains only a thin nested-path remapping wrapper so existing Application-package error paths remain contextual;
- duplicated `VERSION_REF`, floating-alias and exact-reference parser logic was removed from `validate.ts`;
- focused parity coverage verifies package reference validation and direct public validation stay aligned;
- allocation-evidence hardening was expanded to cover authority-field smuggling plus accessor/custom-prototype inputs on persisted allocation evidence.

## Gate consequence

The original Q7 PASS on `25ee1c25223863f3ceeb53210142acd1da331405` remains historical evidence only. Because source/tests changed after that freeze, it is invalidated for final merge authority.

Remediated executable/test head:

`b42ae481700094f118328f111f8011ab44136877`

Q5/Q6 must be re-reviewed on the remediated head and a new exact-head Q7 local run is required before Q8 can restart.
