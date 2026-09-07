# PROD-18 Provisional Cross-Surface Continuity Evidence

**Status:** provisional code-complete workstream; no production device-matrix or external-host deployment claim.

## Owner decision

Run, Human Task, Approval and Artifact state machines remain with their existing canonical owners. `cross-platform-conformance` receives only opaque exact authority references and compares surface observations against them.

It does not mutate or resolve ApplicationRun state, assign Human Tasks, approve transactions, create Artifacts, authorize users, or execute Actions.

## Authority snapshot

A continuity fixture carries only the minimum exact references needed to prove that surfaces are looking at the same authoritative work:

- opaque exact Application release reference;
- opaque exact tenant scope reference;
- ApplicationRun id + revision;
- optional Human Task id + revision;
- optional Approval id + plan digest + plan revision + decision;
- optional Artifact id + revision + digest.

The semantic owners remain responsible for producing and validating those references. This package never reparses their full domain objects.

## Surface model

Evidence may be supplied for `web`, `ios`, `android` and `external-ai-host` independently.

`online`, `offline` and `reconnected` are observation labels, not authority upgrades. An offline surface may legitimately expose stale state to the user, but the report is non-conformant until its exact references converge. A reconnect label does not waive revision or digest drift.

## Negative guarantees

- wrong tenant/Application replay is visible as mismatch;
- stale Run/Task revisions cannot be silently promoted;
- stale Approval meaning is detected by exact plan digest + revision;
- stale Artifact bytes are detected by exact revision + digest;
- duplicate surface evidence fails closed;
- unknown/secret-like fields fail structural validation.

This evidence layer can progress independently of live PROD-17 release checks. Live device/browser deployments remain necessary for production closure, but not for repository-level contract development.
