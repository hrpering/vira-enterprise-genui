# PROD-13 — Q3 Live Provider Security Notes

The real-provider gate is deliberately separate from ordinary PR CI because it performs reversible protected writes against external systems.

Required invariants:

- dedicated canary resources only;
- explicit `VIRA_PROD13_LIVE_PROVIDER_ENABLED=1` opt-in;
- credentials supplied only through environment/secret-provider resolution;
- no credential bytes in observation, execution result, ledger or repository evidence;
- exact GitHub blob SHA / Google ETag precondition tokens;
- independent post-effect reread before any success assertion;
- cleanup uses fresh provider truth and is independently reread;
- any cleanup failure leaves the gate failed and requires manual canary inspection;
- hosted CI remains required in addition to, not instead of, the live mutation proof.

This note does not itself constitute live evidence. Production-authoritative closure requires an exact-head invocation whose structured output reports `closureEligible=true` with `liveProvider=true`.
