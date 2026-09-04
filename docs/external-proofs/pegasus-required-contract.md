# Pegasus external brand proof — required contract

MASTER-23 keeps all Pegasus/airline/flight semantics outside `vira-enterprise-genui`.

The external proof repository is accepted only when it demonstrates all of the following against one exact Vira release candidate:

1. One airline-domain Experience Pack composition is authored outside Vira core.
2. The resulting canonical deployment Pack is published through the normal publication/deployment plane.
3. The exact Pack is approved through the private enterprise registry and resolved through the generic resolver.
4. Web, iOS and Android consume the same Pack identity/version and preserve canonical cross-platform semantics.
5. User actions enter the same Vira Action Boundary and produce the same canonical ActionIntent semantics across all three platforms.
6. Governance exercises at least allow, deny and challenge/approval outcomes without airline-specific branches in Vira core.
7. At least one write action proves stale-revision and duplicate-idempotency protections.
8. Unknown component/action, wrong Pack version and unsigned artifact negative cases fail closed.
9. The proof repository owns all Pegasus, airline and flight naming, fixtures, components, adapters and domain action vocabulary.
10. `vira-enterprise-genui` remains free of those domain semantics in `packages/` and `sdk/` source.

The proof repository must record the exact Vira stack head used for the run and the exact Pack digest. MASTER-25 may not call RC1 complete until this external evidence exists and passes.
