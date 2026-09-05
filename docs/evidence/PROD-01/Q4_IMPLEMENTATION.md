# PROD-01 Q4 — Implementation

Implementation is restricted to the frozen shell scope:

- dependency-free `vira-web`, `vira-api`, and `vira-worker` workspace apps;
- static Web build that normalizes Vercel environments into Vira `development | staging | production`, records exact Git build identity, and prefers exact `VERCEL_DEPLOYMENT_ID` as release identity;
- shared infrastructure-only runtime environment parser and health server;
- fail-closed runtime metadata validation;
- exact Vercel/Railway deployment-identity release manifest parser;
- Vercel root deployment definition;
- Railway project IaC with API/worker in Amsterdam, explicit dev/staging/prod mapping, candidate-branch staging support, production pinned to `main`, and auto-deploy disabled;
- non-root API/worker Docker runtime images;
- production shell verifier and negative/HTTP/Web metadata contract tests;
- deterministic pnpm workspace and Railway IaC npm lockfiles.

No canonical package dependency is mounted by the API or worker entrypoint and no domain endpoint is added.
