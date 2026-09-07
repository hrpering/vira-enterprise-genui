# ADR PROD-00-001 — Production Vendors and Regions

**Status:** ACCEPTED for Production MVP baseline  
**Date:** 2026-09-05  
**Scope:** PROD-00 freeze; concrete provisioning begins in later owning phases

## Decision

Vira Production MVP is EU-first and uses the following baseline topology:

| Concern | Decision | Production locality |
|---|---|---|
| Web + same-origin BFF | Vercel | `fra1` — Frankfurt, Germany |
| API + worker + PostgreSQL | Railway | EU West Metal — Amsterdam, Netherlands (`europe-west4-drams3a`) |
| OIDC | Auth0 Public Cloud | Europe locality; distinct development, staging and production tenants |
| KMS | AWS KMS | `eu-central-1` — Frankfurt |
| Secret Manager | AWS Secrets Manager | `eu-central-1` — Frankfurt |
| Private artifact object store | Amazon S3 | `eu-central-1` — Frankfurt |
| Observability | Grafana Cloud + OpenTelemetry | EU stack/region |

Production, staging and development use separate environments, credentials, databases, provider connections, object-store prefixes/buckets and Auth0 tenants. Production secrets are never copied into preview environments.

## Rationale

- The Final/V6 topology already fixes Vercel for `vira-web`/BFF and Railway for API/worker/PostgreSQL; this ADR resolves the previously open provider/region choices around that topology.
- Railway's current EU production region is Amsterdam. API, worker and PostgreSQL remain co-located there to keep transactional traffic local.
- Vercel documents `fra1` as Frankfurt and recommends placing Functions in the same region as data, or as close as possible. Frankfurt is the chosen EU BFF region and is also the AWS security/object-storage region.
- Auth0 supports a Europe public-cloud locality and recommends separate tenants per environment.
- AWS KMS and Secrets Manager expose `eu-central-1` Frankfurt endpoints; S3 is available in `eu-central-1`.
- Grafana Cloud is used as the managed observability plane with an EU stack and OpenTelemetry-compatible application instrumentation.

## Cross-region consequence

Railway Amsterdam and Vercel/AWS Frankfurt are not the same data center. This is deliberate for the MVP because the required products do not expose one common EU city. The latency budget is therefore measured, not assumed:

- browser → Vercel BFF remains same-origin;
- BFF → Railway API is server-to-server only;
- API/worker ↔ PostgreSQL is same Railway region;
- KMS/secret/object-store calls cross Amsterdam↔Frankfurt only when required.

If measured control-plane overhead violates the frozen p95 budget, the remedy is a topology ADR revision with evidence; it is not silent provider substitution.

## Security requirements

- Browser code never receives provider refresh tokens, API keys, KMS key material or execution-grant secrets.
- Railway API/worker use least-privilege workload credentials; migration credentials are separate.
- S3 buckets are private; access is tenant-authorized and download/upload URLs are short-lived.
- KMS keys, secrets, Auth0 tenants and provider connections are environment-specific.
- Production domain and OIDC callback origins are allowlisted explicitly.

## Exit evidence required in owning phases

This ADR freezes selection only. Later phases must still prove actual account/region configuration, immutable deploy digests, secret access policy, restore behavior, logging redaction and tenant isolation.

## Authoritative vendor references

- Vercel regions: https://vercel.com/docs/regions
- Railway regions: https://docs.railway.com/deployments/regions
- Auth0 tenant regions: https://auth0.com/docs/get-started/auth0-overview/create-tenants
- Auth0 environment isolation: https://auth0.com/docs/get-started/auth0-overview/create-tenants/set-up-multiple-environments
- AWS KMS endpoints: https://docs.aws.amazon.com/general/latest/gr/kms.html
- AWS Secrets Manager endpoints: https://docs.aws.amazon.com/general/latest/gr/asm.html
- AWS regions: https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html
- Grafana Cloud data residency overview: https://grafana.com/docs/learning-hub/which-grafana/02-understand-your-options/10-data-residency-and-compliance/
