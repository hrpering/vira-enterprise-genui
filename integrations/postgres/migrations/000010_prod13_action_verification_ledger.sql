\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('vira:schema-migrations', 0));
SET LOCAL ROLE vira_migration;

CREATE TABLE IF NOT EXISTS vira.action_verification_state (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  verification_id text NOT NULL,
  transaction_id text NOT NULL,
  plan_digest text NOT NULL,
  plan_revision bigint NOT NULL,
  operation_id text NOT NULL,
  execution_id text NOT NULL,
  attempt_id text NOT NULL,
  provider_id text NOT NULL,
  connection_id text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  revision bigint NOT NULL,
  status text NOT NULL,
  lease_epoch bigint NOT NULL,
  lease_worker_id text,
  lease_expires_at timestamptz,
  before_observation_digest text,
  after_observation_digest text,
  write_dispatched_at timestamptz,
  record jsonb NOT NULL,
  persistence_created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  persistence_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, verification_id),
  CONSTRAINT action_verification_state_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT action_verification_state_plan_digest CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT action_verification_state_plan_revision CHECK (plan_revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT action_verification_state_revision CHECK (revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT action_verification_state_lease_epoch CHECK (lease_epoch BETWEEN 0 AND 9007199254740991),
  CONSTRAINT action_verification_state_status CHECK (status IN (
    'pending-precheck', 'precondition-mismatch', 'ready-to-write', 'write-dispatched', 'verifying',
    'verified', 'partial', 'mismatch', 'uncertain', 'manual'
  )),
  CONSTRAINT action_verification_state_lease_pair CHECK ((lease_worker_id IS NULL) = (lease_expires_at IS NULL)),
  CONSTRAINT action_verification_state_before_digest CHECK (before_observation_digest IS NULL OR before_observation_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT action_verification_state_after_digest CHECK (after_observation_digest IS NULL OR after_observation_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT action_verification_state_ids_nonempty CHECK (
    length(verification_id) BETWEEN 1 AND 512
    AND length(transaction_id) BETWEEN 1 AND 512
    AND length(operation_id) BETWEEN 1 AND 512
    AND length(execution_id) BETWEEN 1 AND 512
    AND length(attempt_id) BETWEEN 1 AND 512
    AND length(provider_id) BETWEEN 1 AND 512
    AND length(connection_id) BETWEEN 1 AND 512
    AND length(resource_type) BETWEEN 1 AND 512
    AND length(resource_id) BETWEEN 1 AND 512
  ),
  CONSTRAINT action_verification_state_record_object CHECK ((jsonb_typeof(record) = 'object') IS TRUE),
  CONSTRAINT action_verification_state_record_version CHECK ((record ->> 'version' = '1') IS TRUE),
  CONSTRAINT action_verification_state_record_id CHECK ((record ->> 'verificationId' = verification_id) IS TRUE),
  CONSTRAINT action_verification_state_record_transaction CHECK ((record ->> 'transactionId' = transaction_id) IS TRUE),
  CONSTRAINT action_verification_state_record_plan_digest CHECK ((record ->> 'planDigest' = plan_digest) IS TRUE),
  CONSTRAINT action_verification_state_record_plan_revision CHECK (((record -> 'planRevision') = to_jsonb(plan_revision)) IS TRUE),
  CONSTRAINT action_verification_state_record_operation CHECK ((record ->> 'operationId' = operation_id) IS TRUE),
  CONSTRAINT action_verification_state_record_execution CHECK ((record ->> 'executionId' = execution_id) IS TRUE),
  CONSTRAINT action_verification_state_record_attempt CHECK ((record ->> 'attemptId' = attempt_id) IS TRUE),
  CONSTRAINT action_verification_state_record_provider CHECK ((record ->> 'providerId' = provider_id) IS TRUE),
  CONSTRAINT action_verification_state_record_connection CHECK ((record ->> 'connectionId' = connection_id) IS TRUE),
  CONSTRAINT action_verification_state_record_resource_type CHECK ((record ->> 'resourceType' = resource_type) IS TRUE),
  CONSTRAINT action_verification_state_record_resource_id CHECK ((record ->> 'resourceId' = resource_id) IS TRUE),
  CONSTRAINT action_verification_state_record_revision CHECK (((record -> 'revision') = to_jsonb(revision)) IS TRUE),
  CONSTRAINT action_verification_state_record_status CHECK ((record ->> 'status' = status) IS TRUE),
  CONSTRAINT action_verification_state_record_lease_epoch CHECK (((record -> 'leaseEpoch') = to_jsonb(lease_epoch)) IS TRUE),
  CONSTRAINT action_verification_state_record_scope_organization CHECK ((record -> 'scope' ->> 'organizationId' = organization_id) IS TRUE),
  CONSTRAINT action_verification_state_record_scope_project CHECK ((record -> 'scope' ->> 'projectId' = project_id) IS TRUE),
  CONSTRAINT action_verification_state_record_scope_environment CHECK ((record -> 'scope' ->> 'environment' = environment) IS TRUE),
  FOREIGN KEY (organization_id, project_id, environment, execution_id)
    REFERENCES vira.durable_execution_state (organization_id, project_id, environment, execution_id)
    ON DELETE RESTRICT
);
ALTER TABLE vira.action_verification_state OWNER TO vira_migration;

CREATE UNIQUE INDEX IF NOT EXISTS action_verification_attempt_unique_idx
  ON vira.action_verification_state (organization_id, project_id, environment, execution_id, attempt_id);
CREATE INDEX IF NOT EXISTS action_verification_claim_idx
  ON vira.action_verification_state (organization_id, project_id, environment, status, lease_expires_at, persistence_created_at, verification_id)
  WHERE status IN ('ready-to-write', 'write-dispatched', 'verifying');

CREATE TABLE IF NOT EXISTS vira.action_verification_observation (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  observation_id text NOT NULL,
  verification_id text NOT NULL,
  attempt_id text NOT NULL,
  phase text NOT NULL,
  provider_id text NOT NULL,
  connection_id text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  provider_version_kind text NOT NULL,
  provider_version_value text NOT NULL,
  canonical_digest text NOT NULL,
  observed_at timestamptz NOT NULL,
  observation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, observation_id),
  CONSTRAINT action_verification_observation_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT action_verification_observation_phase CHECK (phase IN ('before', 'after')),
  CONSTRAINT action_verification_observation_version_kind CHECK (provider_version_kind IN ('etag', 'blob-sha', 'version', 'opaque')),
  CONSTRAINT action_verification_observation_digest CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT action_verification_observation_nonempty CHECK (
    length(observation_id) BETWEEN 1 AND 512
    AND length(verification_id) BETWEEN 1 AND 512
    AND length(attempt_id) BETWEEN 1 AND 512
    AND length(provider_id) BETWEEN 1 AND 512
    AND length(connection_id) BETWEEN 1 AND 512
    AND length(resource_type) BETWEEN 1 AND 512
    AND length(resource_id) BETWEEN 1 AND 512
    AND length(provider_version_value) BETWEEN 1 AND 512
  ),
  CONSTRAINT action_verification_observation_json_object CHECK ((jsonb_typeof(observation) = 'object') IS TRUE),
  FOREIGN KEY (organization_id, project_id, environment, verification_id)
    REFERENCES vira.action_verification_state (organization_id, project_id, environment, verification_id)
    ON DELETE RESTRICT
);
ALTER TABLE vira.action_verification_observation OWNER TO vira_migration;
CREATE UNIQUE INDEX IF NOT EXISTS action_verification_observation_phase_idx
  ON vira.action_verification_observation (organization_id, project_id, environment, verification_id, attempt_id, phase, canonical_digest);

CREATE TABLE IF NOT EXISTS vira.production_action_ledger_stream (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  ledger_id text NOT NULL,
  transaction_id text NOT NULL,
  plan_digest text NOT NULL,
  plan_revision bigint NOT NULL,
  next_sequence bigint NOT NULL DEFAULT 0,
  chain_head_hash text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, ledger_id),
  CONSTRAINT production_action_ledger_stream_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT production_action_ledger_stream_digest CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT production_action_ledger_stream_plan_revision CHECK (plan_revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT production_action_ledger_stream_sequence CHECK (next_sequence BETWEEN 0 AND 9007199254740991),
  CONSTRAINT production_action_ledger_stream_head CHECK (chain_head_hash IS NULL OR chain_head_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT production_action_ledger_stream_nonempty CHECK (length(ledger_id) BETWEEN 1 AND 512 AND length(transaction_id) BETWEEN 1 AND 512)
);
ALTER TABLE vira.production_action_ledger_stream OWNER TO vira_migration;

CREATE TABLE IF NOT EXISTS vira.production_action_ledger_entry (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  ledger_id text NOT NULL,
  sequence bigint NOT NULL,
  transaction_id text NOT NULL,
  plan_digest text NOT NULL,
  plan_revision bigint NOT NULL,
  operation_id text NOT NULL,
  execution_id text NOT NULL,
  attempt_id text,
  execution_revision bigint,
  lease_epoch bigint,
  kind text NOT NULL,
  occurred_at timestamptz NOT NULL,
  evidence_digest text NOT NULL,
  previous_entry_hash text,
  entry_hash text NOT NULL,
  entry jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, ledger_id, sequence),
  UNIQUE (organization_id, project_id, environment, ledger_id, entry_hash),
  CONSTRAINT production_action_ledger_entry_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT production_action_ledger_entry_sequence CHECK (sequence BETWEEN 0 AND 9007199254740991),
  CONSTRAINT production_action_ledger_entry_plan_digest CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT production_action_ledger_entry_plan_revision CHECK (plan_revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT production_action_ledger_entry_evidence_digest CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT production_action_ledger_entry_previous_hash CHECK (previous_entry_hash IS NULL OR previous_entry_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT production_action_ledger_entry_hash CHECK (entry_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT production_action_ledger_entry_nonempty CHECK (
    length(ledger_id) BETWEEN 1 AND 512
    AND length(transaction_id) BETWEEN 1 AND 512
    AND length(operation_id) BETWEEN 1 AND 512
    AND length(execution_id) BETWEEN 1 AND 512
    AND (attempt_id IS NULL OR length(attempt_id) BETWEEN 1 AND 512)
  ),
  CONSTRAINT production_action_ledger_entry_json_object CHECK ((jsonb_typeof(entry) = 'object') IS TRUE),
  FOREIGN KEY (organization_id, project_id, environment, ledger_id)
    REFERENCES vira.production_action_ledger_stream (organization_id, project_id, environment, ledger_id)
    ON DELETE RESTRICT
);
ALTER TABLE vira.production_action_ledger_entry OWNER TO vira_migration;

CREATE INDEX IF NOT EXISTS production_action_ledger_entry_execution_idx
  ON vira.production_action_ledger_entry (organization_id, project_id, environment, execution_id, sequence);

CREATE TABLE IF NOT EXISTS vira.production_action_ledger_checkpoint (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  checkpoint_id text NOT NULL,
  ledger_id text NOT NULL,
  sequence bigint NOT NULL,
  chain_head_hash text NOT NULL,
  issued_at timestamptz NOT NULL,
  key_id text NOT NULL,
  signature text NOT NULL,
  checkpoint jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, checkpoint_id),
  UNIQUE (organization_id, project_id, environment, ledger_id, sequence, chain_head_hash),
  CONSTRAINT production_action_ledger_checkpoint_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT production_action_ledger_checkpoint_sequence CHECK (sequence BETWEEN 0 AND 9007199254740991),
  CONSTRAINT production_action_ledger_checkpoint_hash CHECK (chain_head_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT production_action_ledger_checkpoint_nonempty CHECK (
    length(checkpoint_id) BETWEEN 1 AND 512
    AND length(ledger_id) BETWEEN 1 AND 512
    AND length(key_id) BETWEEN 1 AND 512
    AND length(signature) BETWEEN 8 AND 4096
  ),
  CONSTRAINT production_action_ledger_checkpoint_json_object CHECK ((jsonb_typeof(checkpoint) = 'object') IS TRUE),
  FOREIGN KEY (organization_id, project_id, environment, ledger_id, sequence)
    REFERENCES vira.production_action_ledger_entry (organization_id, project_id, environment, ledger_id, sequence)
    ON DELETE RESTRICT
);
ALTER TABLE vira.production_action_ledger_checkpoint OWNER TO vira_migration;

ALTER TABLE vira.action_verification_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.action_verification_state FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.action_verification_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.action_verification_observation FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.production_action_ledger_stream ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.production_action_ledger_stream FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.production_action_ledger_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.production_action_ledger_entry FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.production_action_ledger_checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.production_action_ledger_checkpoint FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS action_verification_state_worker_scope ON vira.action_verification_state;
CREATE POLICY action_verification_state_worker_scope ON vira.action_verification_state
  FOR ALL TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS action_verification_state_ops_scope ON vira.action_verification_state;
CREATE POLICY action_verification_state_ops_scope ON vira.action_verification_state
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS action_verification_observation_worker_scope ON vira.action_verification_observation;
CREATE POLICY action_verification_observation_worker_scope ON vira.action_verification_observation
  FOR SELECT TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS action_verification_observation_insert_scope ON vira.action_verification_observation;
CREATE POLICY action_verification_observation_insert_scope ON vira.action_verification_observation
  FOR INSERT TO vira_worker
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS action_verification_observation_ops_scope ON vira.action_verification_observation;
CREATE POLICY action_verification_observation_ops_scope ON vira.action_verification_observation
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS production_action_ledger_stream_worker_scope ON vira.production_action_ledger_stream;
CREATE POLICY production_action_ledger_stream_worker_scope ON vira.production_action_ledger_stream
  FOR ALL TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS production_action_ledger_stream_ops_scope ON vira.production_action_ledger_stream;
CREATE POLICY production_action_ledger_stream_ops_scope ON vira.production_action_ledger_stream
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS production_action_ledger_entry_worker_read_scope ON vira.production_action_ledger_entry;
CREATE POLICY production_action_ledger_entry_worker_read_scope ON vira.production_action_ledger_entry
  FOR SELECT TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS production_action_ledger_entry_worker_insert_scope ON vira.production_action_ledger_entry;
CREATE POLICY production_action_ledger_entry_worker_insert_scope ON vira.production_action_ledger_entry
  FOR INSERT TO vira_worker
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS production_action_ledger_entry_ops_scope ON vira.production_action_ledger_entry;
CREATE POLICY production_action_ledger_entry_ops_scope ON vira.production_action_ledger_entry
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS production_action_ledger_checkpoint_worker_read_scope ON vira.production_action_ledger_checkpoint;
CREATE POLICY production_action_ledger_checkpoint_worker_read_scope ON vira.production_action_ledger_checkpoint
  FOR SELECT TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS production_action_ledger_checkpoint_worker_insert_scope ON vira.production_action_ledger_checkpoint;
CREATE POLICY production_action_ledger_checkpoint_worker_insert_scope ON vira.production_action_ledger_checkpoint
  FOR INSERT TO vira_worker
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS production_action_ledger_checkpoint_ops_scope ON vira.production_action_ledger_checkpoint;
CREATE POLICY production_action_ledger_checkpoint_ops_scope ON vira.production_action_ledger_checkpoint
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));

REVOKE ALL ON TABLE vira.action_verification_state FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.action_verification_state TO vira_worker;
GRANT UPDATE (revision, status, lease_epoch, lease_worker_id, lease_expires_at, before_observation_digest, after_observation_digest, write_dispatched_at, record, persistence_updated_at)
  ON TABLE vira.action_verification_state TO vira_worker;
GRANT SELECT ON TABLE vira.action_verification_state TO vira_ops;

REVOKE ALL ON TABLE vira.action_verification_observation FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.action_verification_observation TO vira_worker;
GRANT SELECT ON TABLE vira.action_verification_observation TO vira_ops;

REVOKE ALL ON TABLE vira.production_action_ledger_stream FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.production_action_ledger_stream TO vira_worker;
GRANT UPDATE (next_sequence, chain_head_hash, updated_at) ON TABLE vira.production_action_ledger_stream TO vira_worker;
GRANT SELECT ON TABLE vira.production_action_ledger_stream TO vira_ops;

REVOKE ALL ON TABLE vira.production_action_ledger_entry FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.production_action_ledger_entry TO vira_worker;
GRANT SELECT ON TABLE vira.production_action_ledger_entry TO vira_ops;

REVOKE ALL ON TABLE vira.production_action_ledger_checkpoint FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.production_action_ledger_checkpoint TO vira_worker;
GRANT SELECT ON TABLE vira.production_action_ledger_checkpoint TO vira_ops;

SELECT set_config('vira.migration_checksum', :'migration_checksum', true);
DO $vira_migration_record$
DECLARE
  existing_checksum text;
BEGIN
  SELECT checksum INTO existing_checksum
  FROM vira.schema_migrations
  WHERE version = 10;

  IF existing_checksum IS NULL THEN
    INSERT INTO vira.schema_migrations(version, name, checksum)
    VALUES (10, 'prod13_action_verification_ledger', current_setting('vira.migration_checksum'));
  ELSIF existing_checksum <> current_setting('vira.migration_checksum') THEN
    RAISE EXCEPTION 'migration checksum mismatch for version 10';
  END IF;
END
$vira_migration_record$;

COMMIT;
