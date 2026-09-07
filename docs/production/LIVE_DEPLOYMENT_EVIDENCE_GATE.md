# Live Deployment Evidence Gate

**Status:** verifier implementation only; no Vercel or Railway deployment is created by this gate.

This gate converts the Vercel/Railway items in `LIVE_GATE_BLOCKERS.md` into a fail-closed, executable proof. Hosted repository CI is not deployment evidence. A pass is authoritative only when the verifier reads the exact deployed artifacts over live HTTPS.

## What must already exist

A release candidate needs all of the following before this gate can pass:

1. an exact Vercel deployment for `vira-web` built from the candidate Git SHA;
2. an independently identified Railway `vira-api` deployment built from the same SHA;
3. an independently identified Railway `vira-worker` deployment built from the same SHA;
4. a dedicated non-destructive BFF canary route/session that is safe to call in the target environment;
5. the deployed API runtime must actually mount `/v1/bff/proxy` and validate the signed Vercel-to-Railway request boundary.

The current connected Vercel account has no project linked to `hrpering/vira-enterprise-genui`, so the Vercel half is currently an external provisioning blocker. Do not substitute an older `Vira_AI_Platform` deployment.

The current repository also keeps `handleViraApiBffIngress` as a tested security primitive while the deployed `vira-api` shell exposes only health/readiness/build routes. Therefore browser-to-BFF-to-Railway production proof remains blocked until the runtime composition mounts the ingress with real PostgreSQL session authority and dispatch dependencies. This verifier intentionally fails rather than treating library-level tests as deployed evidence.

## Required release manifest

Set `VIRA_RELEASE_MANIFEST_JSON` to the same immutable shape enforced by `ops/deploy/release-manifest.ts`:

```json
{
  "version": "1",
  "environment": "staging",
  "buildSha": "<exact-git-sha>",
  "releaseId": "<release-id>",
  "webDeploymentId": "dpl_<exact-vercel-deployment-id>",
  "webDeploymentUrl": "https://<exact-deployment>.vercel.app",
  "apiDeploymentId": "<exact-railway-api-uuid>",
  "workerDeploymentId": "<exact-railway-worker-uuid>"
}
```

`latest`, mutable aliases, one Railway UUID reused for two services, non-Vercel web URLs, or malformed IDs fail before network access.

## Required live origins

```bash
export VIRA_RAILWAY_API_ORIGIN='https://<api-staging-origin>/'
export VIRA_RAILWAY_WORKER_ORIGIN='https://<worker-staging-origin>/'
```

Both values must be credential-free HTTPS origins. A private worker origin is acceptable only when the verifier runs from an authorized network that can actually resolve and reach it.

If Vercel Deployment Protection is enabled, set its bypass value only in the operator environment:

```bash
export VIRA_VERCEL_PROTECTION_BYPASS='...'
```

Never commit that value.

## Dedicated BFF canary probe

`VIRA_DEPLOYMENT_BFF_PROBE_JSON` carries an operator-controlled browser canary. It should use a dedicated test account/session and a non-destructive target route:

```json
{
  "origin": "https://<configured-web-origin>",
  "cookie": "__Host-vira_session=<canary-session>",
  "csrfToken": "<matching-canary-csrf>",
  "targetPath": "/v1/<non-destructive-canary-route>",
  "organizationId": "<canary-org>",
  "projectId": "<canary-project>",
  "environment": "staging",
  "expectedStatus": 200,
  "body": {}
}
```

Do not paste session or CSRF secrets into a PR, issue, chat transcript, or evidence document. Set them only in the trusted runner/operator environment.

## Proof sequence

Run:

```bash
node tooling/verify-live-deployment-evidence.mjs
```

The verifier then performs all of these checks against live HTTPS endpoints:

- Vercel `build.json` must report `vira-web`, exact environment, exact Git SHA and exact Vercel deployment ID.
- Railway API `/readyz` and `/build` must report `vira-api`, exact environment, exact Git SHA and exact API deployment UUID.
- Railway worker `/readyz` and `/build` must report `vira-worker`, exact environment, exact Git SHA and exact worker deployment UUID.
- A valid browser canary must traverse Vercel BFF and the Railway upstream with the expected 2xx response.
- The same browser request without CSRF must return `403`.
- The same browser request without session cookie must return `401`.
- A direct unsigned POST to Railway `/v1/bff/proxy` must fail closed with `400`, `401`, or `403`.

Only after every check passes does stdout contain:

```json
{
  "gate": "live-deployment-evidence",
  "authority": "live-http",
  "closureEligible": true
}
```

The evidence also records the exact deployment IDs/origins, candidate SHA, release ID and observation timestamp. Any missing environment variable, network failure, identity mismatch, floating reference, missing runtime mount, or failed negative-security probe produces `closureEligible=false` on stderr and exits non-zero.

## Scope and release authority

This gate does **not** deploy, restart, rollback, promote, or mutate Vercel/Railway resources. It also does not by itself prove Railway restart/rollback against an immutable deployment/image digest; that operational rehearsal remains a separate live release blocker.

Until real deployments exist and this verifier passes on their exact identities, Vercel/Railway deployment evidence remains open and must not be represented as Q9/RC closure.
