# ADR PROD-00-002 — Security, Data Classification and Retention

**Status:** ACCEPTED for Production MVP baseline  
**Date:** 2026-09-05

## Trust rule

Model output, agent output, user uploads, provider responses, webhook payloads, protocol imports, web content and artifact content are untrusted input. None can create execution authority by text or shape alone.

Protected effects remain:

```text
exact active Application
→ exact CapabilityRef / ActionRef
→ identity + delegation
→ governance
→ Action Boundary preflight
→ immutable TransactionPlan
→ required approval
→ one-time execution grant
→ durable execution
→ private runner
→ provider effect
→ independent postcondition verification
→ Action Ledger
```

## Data classes

| Class | Examples | Baseline handling |
|---|---|---|
| PUBLIC | public Application metadata intentionally published | may be served publicly after canonical publication rules |
| INTERNAL | non-sensitive config metadata, build metadata, non-secret operational metadata | authenticated access where not explicitly public |
| CONFIDENTIAL | user prompts, WorkContext, provider business data, artifacts, transaction plans/records | tenant-scoped encryption at rest/in transit; least privilege |
| RESTRICTED | OAuth refresh tokens, API keys, service-account material, KMS-related secret references, one-time grant secrets | managed secret store/KMS boundary only; never browser/model/artifact/normal logs |

Credentials and raw secret values are not valid Artifact or WorkContext payloads.

## Tenant and authorization invariants

- Every durable tenant-owned row carries tenant identity directly or through a tenant-safe parent key.
- Cross-tenant read/write/claim and foreign-key confusion attempts fail closed.
- Request pools must not leak tenant/session context across reuse.
- Worker claims and retries are tenant/environment bound and fencing/revision protected.
- Public discovery never converts into authentication, authorization, governance or execution permission.

## Logging and observability

Normal logs, traces, metrics and error payloads must not contain:

- raw access/refresh tokens;
- API keys/service-account private material;
- one-time execution grant secrets;
- full Authorization/Cookie headers;
- unrestricted artifact bodies;
- transaction payload fields classified as RESTRICTED.

Structured logs use stable IDs/digests and explicit redaction. Security-sensitive access is separately auditable.

## Retention baseline

These are engineering defaults, not claims about statutory accounting/tax retention. Customer/legal-hold policy may extend them; shorter deletion may apply where law or contract requires it.

| Data | Default |
|---|---:|
| application/runtime service logs | 30 days |
| distributed traces | 14 days |
| security/authentication audit events | 180 days |
| operational metrics | 13 months |
| unpinned user-generated artifacts after terminal run | 30 days |
| WorkContext transient payload after terminal run | 30 days unless referenced by retained evidence |
| Action Ledger / transaction verification evidence | 400 days minimum |
| commercial usage/rating/pricing/settlement evidence | 400 days minimum |
| webhook raw payload after canonical parse/dedupe | 7 days maximum unless required as incident evidence |
| failed upload/quarantine object | 7 days maximum |

Deletion is a workflow, not a direct blind blob delete: authorization, lineage/reference checks, retention/legal-hold evaluation, object deletion/tombstone and audit evidence are required.

## Artifact/file ingest boundary

- private object storage only;
- explicit media/type and size limits before persistence;
- content sniffing rather than trusting filename/Content-Type alone;
- malware scanning where the artifact type is scannable;
- tenant authorization on every read/write;
- short-lived signed URLs;
- immutable revision + digest + producer/source lineage;
- no secret-bearing provider credentials;
- content never gains Action authority.

## Compliance scope

Production engineering targets GDPR/KVKK-compatible privacy/security controls and requires DPAs/data-processing terms with managed vendors before launch. This ADR does not assert legal certification or legal compliance by itself; legal review remains a launch-process obligation, not a reason to weaken the technical controls above.

Payment card/bank-fund movement is out of Production MVP core scope. Machine Commerce later consumes external payment authorization evidence but Vira core does not become a payment processor.
