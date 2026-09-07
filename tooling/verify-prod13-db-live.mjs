import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.VIRA_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("VIRA_TEST_DATABASE_URL is required for the PROD-13 live PostgreSQL gate");
const parsed = new URL(databaseUrl);
if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
  throw new Error("VIRA_TEST_DATABASE_URL must use postgres/postgresql");
}

execFileSync("node", [path.join(root, "ops/postgres/apply-migrations.mjs")], {
  cwd: root,
  env: { ...process.env, VIRA_DATABASE_URL: databaseUrl },
  stdio: "inherit",
});

const sql = String.raw`
BEGIN;
SET LOCAL ROLE vira_worker;
SELECT set_config('vira.organization_id', 'prod13-live-org', true);
SELECT set_config('vira.project_id', 'prod13-live-project', true);
SELECT set_config('vira.environment', 'staging', true);
SELECT vira.require_scope();

INSERT INTO vira.durable_execution_state (
  organization_id, project_id, environment, execution_id, transaction_id, plan_digest, plan_revision,
  operation_id, grant_id, grant_nonce, idempotency_key, revision, status, lease_epoch,
  lease_worker_id, lease_expires_at, dispatch_state, record
) VALUES (
  'prod13-live-org','prod13-live-project','staging','execution.prod13.live','transaction.prod13.live',repeat('a',64),7,
  'github.repository.file.update','grant.prod13.live','nonce.prod13.live','idem.prod13.live',1,'queued',0,
  NULL,NULL,'not-started',
  jsonb_build_object(
    'version','1','executionId','execution.prod13.live',
    'scope',jsonb_build_object('version','1','organizationId','prod13-live-org','projectId','prod13-live-project','environment','staging'),
    'transactionId','transaction.prod13.live','planDigest',repeat('a',64),'planRevision',7,
    'operationId','github.repository.file.update','grantId','grant.prod13.live','grantNonce','nonce.prod13.live',
    'idempotencyKey','idem.prod13.live','revision',1,'status','queued','leaseEpoch',0,'lease',NULL,
    'dispatchState','not-started','createdAtEpochMs',1900000000000,'updatedAtEpochMs',1900000000000
  )
);

INSERT INTO vira.action_verification_state (
  organization_id, project_id, environment, verification_id, transaction_id, plan_digest, plan_revision,
  operation_id, execution_id, attempt_id, provider_id, connection_id, resource_type, resource_id,
  revision, status, lease_epoch, lease_worker_id, lease_expires_at,
  before_observation_digest, after_observation_digest, write_dispatched_at, record
) VALUES (
  'prod13-live-org','prod13-live-project','staging','verification.prod13.live','transaction.prod13.live',repeat('a',64),7,
  'github.repository.file.update','execution.prod13.live','attempt.prod13.live','github','github.connection',
  'github.repository.file','github.repository.file:prod13-live',1,'pending-precheck',0,NULL,NULL,NULL,NULL,NULL,
  jsonb_build_object(
    'version','1',
    'scope',jsonb_build_object('version','1','organizationId','prod13-live-org','projectId','prod13-live-project','environment','staging'),
    'verificationId','verification.prod13.live','transactionId','transaction.prod13.live','planDigest',repeat('a',64),
    'planRevision',7,'operationId','github.repository.file.update','executionId','execution.prod13.live',
    'attemptId','attempt.prod13.live','providerId','github','connectionId','github.connection',
    'resourceType','github.repository.file','resourceId','github.repository.file:prod13-live',
    'revision',1,'status','pending-precheck','leaseEpoch',0,'lease',NULL,
    'beforeObservationDigest',NULL,'afterObservationDigest',NULL,'writeDispatchedAtEpochMs',NULL,
    'createdAtEpochMs',1900000000000,'updatedAtEpochMs',1900000000000
  )
);

DO $verification_cas$
DECLARE affected integer;
BEGIN
  UPDATE vira.action_verification_state
     SET revision=2,
         record=jsonb_set(record,'{revision}','2'::jsonb,false),
         persistence_updated_at=clock_timestamp()
   WHERE organization_id='prod13-live-org' AND project_id='prod13-live-project' AND environment='staging'
     AND verification_id='verification.prod13.live' AND revision=1
  ;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'verification CAS expected one row, got %', affected; END IF;
END
$verification_cas$;

DO $verification_stale_cas$
DECLARE affected integer;
BEGIN
  UPDATE vira.action_verification_state
     SET revision=3,
         record=jsonb_set(record,'{revision}','3'::jsonb,false),
         persistence_updated_at=clock_timestamp()
   WHERE organization_id='prod13-live-org' AND project_id='prod13-live-project' AND environment='staging'
     AND verification_id='verification.prod13.live' AND revision=1
  ;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'stale verification CAS unexpectedly changed % rows', affected; END IF;
END
$verification_stale_cas$;

INSERT INTO vira.action_verification_observation (
  organization_id, project_id, environment, observation_id, verification_id, attempt_id, phase,
  provider_id, connection_id, resource_type, resource_id, provider_version_kind, provider_version_value,
  canonical_digest, observed_at, observation
) VALUES (
  'prod13-live-org','prod13-live-project','staging','observation.prod13.live.before','verification.prod13.live',
  'attempt.prod13.live','before','github','github.connection','github.repository.file','github.repository.file:prod13-live',
  'blob-sha',repeat('1',40),repeat('b',64),clock_timestamp(),
  jsonb_build_object('version','1','phase','before','canonicalDigest',repeat('b',64))
);

DO $append_only_observation$
BEGIN
  BEGIN
    UPDATE vira.action_verification_observation
       SET canonical_digest=repeat('c',64)
     WHERE observation_id='observation.prod13.live.before';
    RAISE EXCEPTION 'append-only observation UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$append_only_observation$;

INSERT INTO vira.production_action_ledger_stream (
  organization_id, project_id, environment, ledger_id, transaction_id, plan_digest, plan_revision
) VALUES (
  'prod13-live-org','prod13-live-project','staging','ledger.prod13.live','transaction.prod13.live',repeat('a',64),7
);

INSERT INTO vira.production_action_ledger_entry (
  organization_id, project_id, environment, ledger_id, sequence, transaction_id, plan_digest, plan_revision,
  operation_id, execution_id, attempt_id, execution_revision, lease_epoch, kind, occurred_at,
  evidence_digest, previous_entry_hash, entry_hash, entry
) VALUES (
  'prod13-live-org','prod13-live-project','staging','ledger.prod13.live',0,'transaction.prod13.live',repeat('a',64),7,
  'github.repository.file.update','execution.prod13.live','attempt.prod13.live',2,1,'provider.precondition.observed',
  clock_timestamp(),repeat('b',64),NULL,repeat('d',64),
  jsonb_build_object(
    'version','1',
    'scope',jsonb_build_object('version','1','organizationId','prod13-live-org','projectId','prod13-live-project','environment','staging'),
    'ledgerId','ledger.prod13.live','sequence',0,'transactionId','transaction.prod13.live','planDigest',repeat('a',64),
    'planRevision',7,'operationId','github.repository.file.update','executionId','execution.prod13.live',
    'attemptId','attempt.prod13.live','executionRevision',2,'leaseEpoch',1,'kind','provider.precondition.observed',
    'occurredAtEpochMs',1900000001000,'evidenceDigest',repeat('b',64),'evidence',jsonb_build_object('status','match'),
    'previousEntryHash',NULL,'entryHash',repeat('d',64)
  )
);

DO $ledger_cas$
DECLARE affected integer;
BEGIN
  UPDATE vira.production_action_ledger_stream
     SET next_sequence=1, chain_head_hash=repeat('d',64), updated_at=clock_timestamp()
   WHERE organization_id='prod13-live-org' AND project_id='prod13-live-project' AND environment='staging'
     AND ledger_id='ledger.prod13.live' AND next_sequence=0 AND chain_head_hash IS NULL
  ;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'ledger CAS expected one row, got %', affected; END IF;
END
$ledger_cas$;

DO $ledger_stale_cas$
DECLARE affected integer;
BEGIN
  UPDATE vira.production_action_ledger_stream
     SET next_sequence=2, chain_head_hash=repeat('e',64), updated_at=clock_timestamp()
   WHERE organization_id='prod13-live-org' AND project_id='prod13-live-project' AND environment='staging'
     AND ledger_id='ledger.prod13.live' AND next_sequence=0 AND chain_head_hash IS NULL
  ;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'stale ledger CAS unexpectedly changed % rows', affected; END IF;
END
$ledger_stale_cas$;

DO $append_only_ledger$
BEGIN
  BEGIN
    UPDATE vira.production_action_ledger_entry
       SET entry_hash=repeat('e',64)
     WHERE ledger_id='ledger.prod13.live' AND sequence=0;
    RAISE EXCEPTION 'append-only ledger UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$append_only_ledger$;

INSERT INTO vira.production_action_ledger_checkpoint (
  organization_id, project_id, environment, checkpoint_id, ledger_id, sequence, chain_head_hash,
  issued_at, key_id, signature, checkpoint
) VALUES (
  'prod13-live-org','prod13-live-project','staging','checkpoint.prod13.live.0','ledger.prod13.live',0,repeat('d',64),
  clock_timestamp(),'kms.prod13.live','signature-prod13-live',
  jsonb_build_object(
    'version','1','audience','vira.action-ledger.checkpoint',
    'scope',jsonb_build_object('version','1','organizationId','prod13-live-org','projectId','prod13-live-project','environment','staging'),
    'ledgerId','ledger.prod13.live','transactionId','transaction.prod13.live','planDigest',repeat('a',64),'planRevision',7,
    'sequence',0,'chainHeadHash',repeat('d',64),'issuedAtEpochMs',1900000002000,
    'keyId','kms.prod13.live','signature','signature-prod13-live'
  )
);

DO $append_only_checkpoint$
BEGIN
  BEGIN
    UPDATE vira.production_action_ledger_checkpoint
       SET signature='tampered-signature'
     WHERE checkpoint_id='checkpoint.prod13.live.0';
    RAISE EXCEPTION 'append-only checkpoint UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$append_only_checkpoint$;

SELECT set_config('vira.organization_id', 'other-org', true);
SELECT set_config('vira.project_id', 'other-project', true);
SELECT set_config('vira.environment', 'staging', true);
SELECT vira.require_scope();
DO $tenant_isolation$
BEGIN
  IF EXISTS (SELECT 1 FROM vira.action_verification_state WHERE verification_id='verification.prod13.live')
    THEN RAISE EXCEPTION 'cross-tenant verification state was visible'; END IF;
  IF EXISTS (SELECT 1 FROM vira.action_verification_observation WHERE observation_id='observation.prod13.live.before')
    THEN RAISE EXCEPTION 'cross-tenant verification observation was visible'; END IF;
  IF EXISTS (SELECT 1 FROM vira.production_action_ledger_entry WHERE ledger_id='ledger.prod13.live')
    THEN RAISE EXCEPTION 'cross-tenant ledger entry was visible'; END IF;
  IF EXISTS (SELECT 1 FROM vira.production_action_ledger_checkpoint WHERE ledger_id='ledger.prod13.live')
    THEN RAISE EXCEPTION 'cross-tenant ledger checkpoint was visible'; END IF;
END
$tenant_isolation$;

ROLLBACK;
`;

execFileSync("psql", [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "inherit", "inherit"],
});

process.stdout.write("PROD-13 live PostgreSQL verification/ledger transaction gate passed.\n");
