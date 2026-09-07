# PROD-01 Q3 — Red Proof

The frozen PROD-00 parent structurally fails PROD-01 exit criteria: required production roots, deploy definitions, environment parser, health surfaces and release manifest are absent.

Negative fixtures are explicit in `tests/production/production-shell.test.ts`:

- missing `VIRA_ENVIRONMENT` must fail;
- invalid environment/port must fail;
- unknown shell route must return 404;
- non-GET shell request must return 405;
- Vercel `preview` must normalize to Vira `staging` and exact `VERCEL_DEPLOYMENT_ID` must be emitted as Web release identity;
- an unsupported Web target environment must fail closed;
- floating/malformed Vercel or Railway deployment identities must fail;
- the same Railway deployment ID cannot represent API and worker;
- unknown release-manifest fields must fail;
- insecure or non-Vercel web URLs must fail; URL evidence is never substituted for the exact Vercel deployment ID identity.

Lockfile bootstrapping also exposed a real tooling red condition: the first npm-lock bootstrap used `git diff --quiet`, which does not report a newly-created untracked file. The bootstrap was corrected to inspect `git status --porcelain`; only generated lockfiles are retained and the writer workflow is deleted from the final tree.

Hosted CI also produced two useful lint red proofs during implementation: browser/Node globals and generated Web output were initially unscoped, then `apps/vira-web/build.mjs` still lacked an explicit Node-global scope. The final ESLint config keeps `no-undef` enabled globally, ignores only generated `apps/vira-web/dist/**`, and grants readonly globals only to the exact PROD-01 files that require them.
