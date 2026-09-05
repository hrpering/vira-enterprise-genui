# PROD-01 Q5/Q6 — Security and Architecture Review

## Q5 Security

- Startup configuration fails closed before a service can report readiness.
- No secret value is declared in app source, Vercel config, Railway IaC, example environment or build metadata.
- `/build` exposes release/build identity only, never credentials.
- Server shell has no body parser or product input surface; unknown routes fail closed.
- Railway auto-deploy is disabled and production refuses non-`main` source; promotion remains explicit.
- API/worker Docker runtime runs as the unprivileged `node` user.
- Root and IaC dependency installs are locked; temporary lockfile writer is forbidden by `verify:production-shell`.
- Release manifests require exact Vercel/Railway deployment identities and reject mutable web aliases as artifact identity.

## Q6 Architecture / UX

- No second semantic owner is introduced; apps compose infrastructure-only shell utilities.
- `integrations/*` stays empty of adapters until an owning phase authorizes them.
- API and worker are independently startable/restartable and carry distinct service/deployment identity.
- Web is independently built/deployed and reports its release metadata accessibly without requiring JavaScript-generated markup for the primary content.
- Health/readiness/build endpoints are intentionally tiny and platform-neutral.
- Vercel Frankfurt and Railway Amsterdam match the accepted PROD-00 region ADR.
- Railway IaC uses the current project-level `.railway/railway.ts` model rather than deprecated service Config-as-Code.
- Staging can deploy the frozen candidate branch while `/build` proves the exact Git SHA; production remains `main`-only.

## Open external evidence

Source review cannot fabricate Vercel preview or Railway staging/restart/rollback success. Those remain Q7/Q9 external gates and must be captured against the final executable head before merge.
