# Reverse-engineering / QC review

Every implementation PR receives an independent review that starts from the requested specification and determines what the code actually does.

## Required inspection

1. Changed files.
2. Import/dependency direction.
3. Runtime control flow.
4. State ownership.
5. Side effects.
6. Error paths.
7. Input/output validation.
8. Permission boundaries.
9. Security assumptions.
10. Test quality.
11. Dead code and fake abstractions.
12. Customer/domain/framework leakage.
13. Raw untrusted data flow.
14. Mutation/race/resource cleanup risks.
15. Public API changes.

## Verdict

Return exactly one of:

- `PASS`
- `CONDITIONAL PASS`
- `FAIL`

Only `PASS` is mergeable.
