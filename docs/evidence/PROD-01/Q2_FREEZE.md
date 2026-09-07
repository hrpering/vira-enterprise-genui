# PROD-01 Q2 — Contract Freeze

**PASS.** The production shell contract is frozen before production domain behavior.

## Service surface

API and worker accept only:

```text
GET /healthz
GET /readyz
GET /build
```

Unknown routes return 404 and non-GET requests return 405. No product/domain endpoint is authorized.

## Startup environment

Required logical values are:

- environment: exact `development | staging | production`;
- port: integer `1..65535`;
- immutable build SHA: explicit `VIRA_BUILD_SHA` or Railway `RAILWAY_GIT_COMMIT_SHA`;
- release identity: explicit `VIRA_RELEASE_ID` or Railway `RAILWAY_DEPLOYMENT_ID`.

Missing or malformed values abort startup before readiness is served.

For Web, Vercel system environments are normalized into the same Vira environment model: `development → development`, `preview → staging`, `production → production`; `VERCEL_TARGET_ENV=staging` is also accepted for an explicit custom staging environment. The build identity comes from `VERCEL_GIT_COMMIT_SHA` (or explicit `VIRA_BUILD_SHA`) and the deployment/release identity prefers exact `VERCEL_DEPLOYMENT_ID`.

## Promotion contract

A release manifest is exact-versioned (`version=1`), staging/production only, records the exact Git build SHA, exact Vercel deployment ID plus HTTPS `*.vercel.app` deployment URL evidence, and independent exact Railway deployment UUIDs for API and worker. The Vercel deployment ID is the immutable Web identity; the URL is supporting deployment evidence and must be correlated to that ID during the external smoke. Mutable custom domains or floating references such as `latest` are not accepted as artifact identity.

Railway rollback/restart operate on stored deployment artifacts/images. Promotion/rollback evidence therefore records actual deployment identities rather than inventing an external OCI registry that PROD-00 did not freeze.

## Platform contract

- Web: Vercel, `fra1`, manual promotion capable.
- API/worker: Railway IaC, `europe-west4-drams3a`, auto-deploy disabled, `/readyz` healthcheck.
- Railway environment name: exact `development | staging | production`.
- Railway source: `main` by default; staging/development may use an explicit frozen-candidate branch override, while production rejects non-`main` source.
- Railway IaC SDK: exact `railway@3.11.0` with its own npm lockfile.
- Root workspace: pnpm 11.24.0 frozen lockfile.
