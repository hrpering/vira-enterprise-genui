# Production Shell Deployment Runbook

## Preconditions

- PROD-00 Q9 and live `main` protection are closed before production promotion.
- Final source SHA is recorded and all repository gates are green.
- Vercel and Railway environments are linked to the intended staging/production projects.

## Local shell verification

```bash
pnpm install --frozen-lockfile
npm ci --prefix .railway
pnpm verify:production-shell
pnpm verify:all
```

For API/worker local startup, set the four values in `ops/deploy/environment.example`, build once with `pnpm build`, then run the corresponding workspace `start` script.

## Vercel preview

From the repository root:

```bash
vercel deploy
```

Verify the rendered shell and `/build.json`; record the immutable Vercel deployment ID, deployment-specific `*.vercel.app` URL and exact Git SHA. Production custom-domain aliases are not accepted as immutable artifact identity. Production promotion is separate.

## Railway staging

For a pre-merge frozen candidate, point staging explicitly at the candidate branch while leaving auto-deploy disabled:

```bash
export VIRA_RAILWAY_SOURCE_BRANCH=prod/01-production-shell
npm ci --prefix .railway
railway login
railway link
railway config plan --file .railway/railway.ts
railway config apply --file .railway/railway.ts
```

Production must not set a non-main source override; the IaC rejects it.

After deploying the frozen candidate, verify for both services:

```text
GET /healthz -> 200
GET /readyz  -> 200
GET /build   -> exact final Git SHA + Railway deployment ID
GET /actions -> 404
```

Record independent API and worker deployment UUIDs with `railway deployment list --service <service>`. Railway provides `PORT`, `RAILWAY_GIT_COMMIT_SHA`, and `RAILWAY_DEPLOYMENT_ID`; service code binds `0.0.0.0:$PORT`.

## Independent restart smoke

Restart API without rebuilding and verify worker remains healthy:

```bash
railway restart --service vira-api --yes
```

Then restart worker and verify API remains healthy:

```bash
railway restart --service vira-worker --yes
```

Record post-restart `/build` responses. Restart must retain the same deployment/build identity.

## Rollback smoke

After a second known-good staging deployment exists, use Railway's deployment rollback on each service and confirm the restored `/build` matches the selected prior deployment's Git SHA/release identity. Railway rollback restores the stored deployment Docker image and its custom variables without rebuilding while the image is still inside the plan's retention window.

## Promotion record

Create a reviewed manifest in the shape of `ops/deploy/release-manifest.example.json` containing the exact Git SHA, immutable Vercel deployment ID/URL, and independent Railway API/worker deployment UUIDs. If readiness fails or any observed build/deployment identity differs from the manifest, do not promote.
