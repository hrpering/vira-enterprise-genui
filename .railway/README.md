# Vira Railway Infrastructure as Code

This directory is an isolated infrastructure-tool boundary and is not part of the pnpm workspace.

```bash
npm ci --prefix .railway
railway login
railway link
railway config plan --file .railway/railway.ts
railway config apply --file .railway/railway.ts
```

The TypeScript SDK is exact-pinned in both `package.json` and `package-lock.json`. `vira-api` and `vira-worker` use `/readyz` as the deployment activation healthcheck and have GitHub auto-deploy disabled.

The Railway environment name must be exactly `development`, `staging`, or `production`. Source defaults to `main`. A staging/dev smoke may explicitly set `VIRA_RAILWAY_SOURCE_BRANCH` to the frozen candidate branch; the service `/build` response must then prove the exact `RAILWAY_GIT_COMMIT_SHA`. Production rejects any source branch other than `main`.

Runtime build SHA and deployment identity come from Railway-provided variables. Secrets are not stored in this file.
