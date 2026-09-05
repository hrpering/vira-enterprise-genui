# ADR PROD-00-003 — SLO, DR, Incident and Support Ownership

**Status:** ACCEPTED  
**Date:** 2026-09-05

## Production SLOs

| Signal | Production MVP objective |
|---|---:|
| API/control-plane monthly availability | >= 99.9% |
| control-plane processing overhead | p95 <= 300 ms, excluding provider/model duration |
| durable DB commit → UI/read-model visibility | p95 <= 2 s |
| Web LCP | p75 <= 2.5 s |
| Web INP | p75 <= 200 ms |
| Web CLS | p75 <= 0.1 |
| durable continuation | exactly-once resume after 24 h wait + repeated service restart |

Provider outages are measured separately from Vira control-plane availability. A provider `2xx` is not a successful protected effect until postconditions verify.

## DR targets

- **RPO:** <= 5 minutes.
- **RTO:** <= 60 minutes.
- Restore proof is required before Production MVP RC; a backup configuration without a successful restore rehearsal is not evidence.
- Recovery must include PostgreSQL durable state, object-store references/bytes needed by retained runs, deployment/version identity and the ability to re-establish managed-secret/KMS access without copying secret values into repository evidence.

## Failure posture

The system fails closed when it cannot establish:

- tenant/principal/delegation identity;
- exact Application/Capability/Action/policy reference;
- active deployment binding;
- grant nonce freshness;
- durable idempotency reservation;
- precondition freshness where required;
- postcondition verification after a provider effect.

An uncertain external effect is not automatically retried. It moves to verification/operator attention according to Action-specific retry semantics.

## Incident severities

| Severity | Definition | Initial operational action |
|---|---|---|
| SEV0 | confirmed cross-tenant exposure, leaked production secret, uncontrolled protected writes, ledger integrity compromise, or widespread ambiguous external effects | disable affected write paths immediately; security + platform incident command |
| SEV1 | broad production outage, identity unavailable, DB unavailable, transaction runner unavailable, or verified-effects pipeline materially impaired | stop risky execution, preserve evidence, restore service/consistency |
| SEV2 | degraded feature/provider path with bounded blast radius and safe fallback/fail-closed behavior | isolate affected capability/provider; repair within normal incident rotation |
| SEV3 | non-urgent defect with no security/durability breach | normal backlog with regression coverage |

## Ownership

- **Platform/on-call:** Vercel/Railway service health, deploy, worker, network and runtime operations.
- **Data owner:** PostgreSQL migration/backup/restore and durable-store integrity.
- **Security owner:** OIDC/delegation, tenant isolation, secrets/KMS, incident containment and credential revocation.
- **Runtime/control-plane owner:** ApplicationRun/Transaction state machines, idempotency, grants, Action Boundary and verification behavior.
- **Provider owner:** adapter/connection health, provider-specific retry/idempotency/verification declarations.
- **Support owner:** user-visible incident communication, task/operator queue triage and evidence collection without requesting secrets.

No individual name is encoded as production authority. Repository CODEOWNERS/on-call tooling may map these roles to people later without changing semantic ownership.

## Release gate

PROD-17 cannot close unless synthetic/RUM performance evidence, alert routing, restore rehearsal, incident runbooks and a protected-effect uncertain-state drill satisfy these targets on the exact RC deployment.
