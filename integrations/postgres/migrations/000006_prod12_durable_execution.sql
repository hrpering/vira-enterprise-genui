\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('vira:schema-migrations', 0));
SET LOCAL ROLE vira_migration;

CREATE TABLE IF NOT EXISTS vira.durable_execution_state (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  execution_id text NOT NULL,
  transaction_id text NOT NULL,
  plan_digest text NOT NULL,
  plan_revision bigint NOT NULL,
  operation_id text NOT NULL,
  grant_id text NOT NULL,
  grant_nonce text NOT NULL,
  idempotency_key text NOT NULL,
  revision bigint NOT NULL,
  status text NOT NULL,
  lease_epoch bigint NOT NULL,
  lease_worker_id text,
  lease_expires_at timestamptz,
  dispatch_state text NOT NULL,
  record jsonb NOT NULL,
  persistence_created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  persistence_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, execution_id),
  CONSTRAINT durable_execution_state_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT durable_execution_state_plan_digest CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT durable_execution_state_plan_revision CHECK (plan_revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT durable_execution_state_revision CHECK (revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT durable_execution_state_lease_epoch CHECK (lease_epoch BETWEEN 0 AND 9007199254740991),
  CONSTRAINT durable_execution_state_status CHECK (status IN ('queued', 'executing', 'verifying', 'partial', 'mismatch', 'uncertain', 'recovery', 'manual')),
  CONSTRAINT durable_execution_state_dispatch CHECK (dispatch_state IN ('not-started', 'started')),
  CONSTRAINT durable_execution_state_lease_pair CHECK ((lease_worker_id IS NULL) = (lease_expires_at IS NULL)),
  CONSTRAINT durable_execution_state_ids_nonempty CHECK (
    length(execution_id) BETWEEN 1 AND 512
    AND length(transaction_id) BETWEEN 1 AND 512
    AND length(operation_id) BETWEEN 1 AND 512
    AND length(grant_id) BETWEEN 1 AND 512
    AND length(grant_nonce) BETWEEN 1 AND 512
    AND length(idempotency_key) BETWEEN 1 AND 512
  ),
  CONSTRAINT durable_execution_state_record_object CHECK ((jsonb_typeof(record) = 'object') IS TRUE),
  CONSTRAINT durable_execution_state_record_scope_object CHECK ((jsonb_typeof(record -> 'scope') = 'object') IS TRUE),
  CONSTRAINT durable_execution_state_record_version CHECK ((record ->> 'version' = '1') IS TRUE),
  CONSTRAINT durable_execution_state_record_execution CHECK ((record ->> 'executionId' = execution_id) IS TRUE),
  CONSTRAINT durable_execution_state_record_transaction CHECK ((record ->> 'transactionId' = transaction_id) IS TRUE),
  CONSTRAINT durable_execution_state_record_digest CHECK ((record ->> 'planDigest' = plan_digest) IS TRUE),
  CONSTRAINT durable_execution_state_record_plan_revision CHECK (((record -> 'planRevision') = to_jsonb(plan_revision)) IS TRUE),
  CONSTRAINT durable_execution_state_record_operation CHECK ((record ->> 'operationId' = operation_id) IS TRUE),
  CONSTRAINT durable_execution_state_record_grant CHECK ((record ->> 'grantId' = grant_id) IS TRUE),
  CONSTRAINT durable_execution_state_record_nonce CHECK ((record ->> 'grantNonce' = grant_nonce) IS TRUE),
  CONSTRAINT durable_execution_state_record_idempotency CHECK ((record ->> 'idempotencyKey' = idempotency_key) IS TRUE),
  CONSTRAINT durable_execution_state_record_revision CHECK (((record -> 'revision') = to_jsonb(revision)) IS TRUE),
  CONSTRAINT durable_execution_state_record_status CHECK ((record ->> 'status' = status) IS TRUE),
  CONSTRAINT durable_execution_state_record_lease_epoch CHECK (((record -> 'leaseEpoch') = to_jsonb(lease_epoch)) IS TRUE),
  CONSTRAINT durable_execution_state_record_dispatch CHECK ((record ->> 'dispatchState' = dispatch_state) IS TRUE),
  CONSTRAINT durable_execution_state_record_scope_version CHECK ((record -> 'scope' ->> 'version' = '1') IS TRUE),
  CONSTRAINT durable_execution_state_record_scope_organization CHECK ((record -> 'scope' ->> 'organizationId' = organization_id) IS TRUE),
  CONSTRAINT durable_execution_state_record_scope_project CHECK ((record -> 'scope' ->> 'projectId' = project_id) IS TRUE),
  CONSTRAINT durable_execution_state_record_scope_environment CHECK ((record -> 'scope' ->> 'environment' = environment) IS TRUE)
);
ALTER TABLE vira.durable_execution_state OWNER TO vira_migration;

CREATE INDEX IF NOT EXISTS durable_execution_state_claim_idx
  ON vira.durable_execution_state (organization_id, project_id, environment, status, lease_expires_at, persistence_created_at, execution_id)
  WHERE status IN ('queued', 'recovery');
CREATE INDEX IF NOT EXISTS durable_execution_state_transaction_idx
  ON vira.durable_execution_state (organization_id, project_id, environment, transaction_id, plan_digest, plan_revision);

CREATE TABLE IF NOT EXISTS vira.durable_execution_nonce (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  nonce text NOT NULL,
  grant_id text NOT NULL,
  execution_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, nonce),
  CONSTRAINT durable_execution_nonce_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT durable_execution_nonce_nonempty CHECK (
    length(nonce) BETWEEN 1 AND 512
    AND length(grant_id) BETWEEN 1 AND 512
    AND length(execution_id) BETWEEN 1 AND 512
  ),
  FOREIGN KEY (organization_id, project_id, environment, execution_id)
    REFERENCES vira.durable_execution_state (organization_id, project_id, environment, execution_id)
    ON DELETE RESTRICT
);
ALTER TABLE vira.durable_execution_nonce OWNER TO vira_migration;

CREATE TABLE IF NOT EXISTS vira.durable_execution_idempotency_reservation (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  idempotency_key text NOT NULL,
  reservation_id text NOT NULL,
  execution_id text NOT NULL,
  transaction_id text NOT NULL,
  plan_digest text NOT NULL,
  plan_revision bigint NOT NULL,
  operation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, idempotency_key),
  CONSTRAINT durable_execution_idempotency_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT durable_execution_idempotency_digest CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT durable_execution_idempotency_plan_revision CHECK (plan_revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT durable_execution_idempotency_nonempty CHECK (
    length(idempotency_key) BETWEEN 1 AND 512
    AND length(reservation_id) BETWEEN 1 AND 1024
    AND length(execution_id) BETWEEN 1 AND 512
    AND length(transaction_id) BETWEEN 1 AND 512
    AND length(operation_id) BETWEEN 1 AND 512
  ),
  FOREIGN KEY (organization_id, project_id, environment, execution_id)
    REFERENCES vira.durable_execution_state (organization_id, project_id, environment, execution_id)
    ON DELETE RESTRICT
);
ALTER TABLE vira.durable_execution_idempotency_reservation OWNER TO vira_migration;

CREATE UNIQUE INDEX IF NOT EXISTS durable_execution_idempotency_reservation_id_idx
  ON vira.durable_execution_idempotency_reservation (organization_id, project_id, environment, reservation_id);

CREATE TABLE IF NOT EXISTS vira.durable_execution_effect_reservation (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  transaction_id text NOT NULL,
  plan_digest text NOT NULL,
  plan_revision bigint NOT NULL,
  operation_id text NOT NULL,
  reservation_id text NOT NULL,
  execution_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, transaction_id, plan_digest, plan_revision, operation_id),
  CONSTRAINT durable_execution_effect_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT durable_execution_effect_digest CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT durable_execution_effect_plan_revision CHECK (plan_revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT durable_execution_effect_nonempty CHECK (
    length(transaction_id) BETWEEN 1 AND 512
    AND length(operation_id) BETWEEN 1 AND 512
    AND length(reservation_id) BETWEEN 1 AND 1024
    AND length(execution_id) BETWEEN 1 AND 512
  ),
  FOREIGN KEY (organization_id, project_id, environment, execution_id)
    REFERENCES vira.durable_execution_state (organization_id, project_id, environment, execution_id)
    ON DELETE RESTRICT
);
ALTER TABLE vira.durable_execution_effect_reservation OWNER TO vira_migration;

CREATE UNIQUE INDEX IF NOT EXISTS durable_execution_effect_reservation_id_idx
  ON vira.durable_execution_effect_reservation (organization_id, project_id, environment, reservation_id);

CREATE TABLE IF NOT EXISTS vira.durable_execution_outbox (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  event_id text NOT NULL,
  execution_id text NOT NULL,
  event_type text NOT NULL,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, event_id),
  CONSTRAINT durable_execution_outbox_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT durable_execution_outbox_type CHECK (event_type IN ('execution.queued', 'execution.claimed', 'execution.dispatch-started', 'execution.state-changed')),
  CONSTRAINT durable_execution_outbox_nonempty CHECK (length(event_id) BETWEEN 1 AND 1024 AND length(execution_id) BETWEEN 1 AND 512),
  CONSTRAINT durable_execution_outbox_event_object CHECK ((jsonb_typeof(event) = 'object') IS TRUE),
  CONSTRAINT durable_execution_outbox_event_scope_object CHECK ((jsonb_typeof(event -> 'scope') = 'object') IS TRUE),
  CONSTRAINT durable_execution_outbox_event_version CHECK ((event ->> 'version' = '1') IS TRUE),
  CONSTRAINT durable_execution_outbox_event_id CHECK ((event ->> 'eventId' = event_id) IS TRUE),
  CONSTRAINT durable_execution_outbox_event_execution CHECK ((event ->> 'executionId' = execution_id) IS TRUE),
  CONSTRAINT durable_execution_outbox_event_type_match CHECK ((event ->> 'eventType' = event_type) IS TRUE),
  CONSTRAINT durable_execution_outbox_event_scope_organization CHECK ((event -> 'scope' ->> 'organizationId' = organization_id) IS TRUE),
  CONSTRAINT durable_execution_outbox_event_scope_project CHECK ((event -> 'scope' ->> 'projectId' = project_id) IS TRUE),
  CONSTRAINT durable_execution_outbox_event_scope_environment CHECK ((event -> 'scope' ->> 'environment' = environment) IS TRUE),
  FOREIGN KEY (organization_id, project_id, environment, execution_id)
    REFERENCES vira.durable_execution_state (organization_id, project_id, environment, execution_id)
    ON DELETE RESTRICT
);
ALTER TABLE vira.durable_execution_outbox OWNER TO vira_migration;

CREATE INDEX IF NOT EXISTS durable_execution_outbox_created_idx
  ON vira.durable_execution_outbox (organization_id, project_id, environment, created_at, event_id);

CREATE TABLE IF NOT EXISTS vira.durable_execution_outbox_consumer (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  event_id text NOT NULL,
  consumer_id text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, event_id, consumer_id),
  CONSTRAINT durable_execution_outbox_consumer_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT durable_execution_outbox_consumer_nonempty CHECK (length(event_id) BETWEEN 1 AND 1024 AND length(consumer_id) BETWEEN 1 AND 512),
  FOREIGN KEY (organization_id, project_id, environment, event_id)
    REFERENCES vira.durable_execution_outbox (organization_id, project_id, environment, event_id)
    ON DELETE RESTRICT
);
ALTER TABLE vira.durable_execution_outbox_consumer OWNER TO vira_migration;

ALTER TABLE vira.durable_execution_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_state FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_nonce ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_nonce FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_idempotency_reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_idempotency_reservation FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_effect_reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_effect_reservation FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_outbox_consumer ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_outbox_consumer FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS durable_execution_state_read_scope ON vira.durable_execution_state;
CREATE POLICY durable_execution_state_read_scope ON vira.durable_execution_state
  FOR SELECT TO vira_api, vira_worker, vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS durable_execution_state_insert_scope ON vira.durable_execution_state;
CREATE POLICY durable_execution_state_insert_scope ON vira.durable_execution_state
  FOR INSERT TO vira_worker
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS durable_execution_state_update_scope ON vira.durable_execution_state;
CREATE POLICY durable_execution_state_update_scope ON vira.durable_execution_state
  FOR UPDATE TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS durable_execution_nonce_worker_scope ON vira.durable_execution_nonce;
CREATE POLICY durable_execution_nonce_worker_scope ON vira.durable_execution_nonce
  FOR ALL TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS durable_execution_nonce_ops_scope ON vira.durable_execution_nonce;
CREATE POLICY durable_execution_nonce_ops_scope ON vira.durable_execution_nonce
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS durable_execution_idempotency_worker_scope ON vira.durable_execution_idempotency_reservation;
CREATE POLICY durable_execution_idempotency_worker_scope ON vira.durable_execution_idempotency_reservation
  FOR ALL TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS durable_execution_idempotency_ops_scope ON vira.durable_execution_idempotency_reservation;
CREATE POLICY durable_execution_idempotency_ops_scope ON vira.durable_execution_idempotency_reservation
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS durable_execution_effect_worker_scope ON vira.durable_execution_effect_reservation;
CREATE POLICY durable_execution_effect_worker_scope ON vira.durable_execution_effect_reservation
  FOR ALL TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS durable_execution_effect_ops_scope ON vira.durable_execution_effect_reservation;
CREATE POLICY durable_execution_effect_ops_scope ON vira.durable_execution_effect_reservation
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS durable_execution_outbox_read_scope ON vira.durable_execution_outbox;
CREATE POLICY durable_execution_outbox_read_scope ON vira.durable_execution_outbox
  FOR SELECT TO vira_api, vira_worker, vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS durable_execution_outbox_insert_scope ON vira.durable_execution_outbox;
CREATE POLICY durable_execution_outbox_insert_scope ON vira.durable_execution_outbox
  FOR INSERT TO vira_worker
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS durable_execution_outbox_consumer_worker_scope ON vira.durable_execution_outbox_consumer;
CREATE POLICY durable_execution_outbox_consumer_worker_scope ON vira.durable_execution_outbox_consumer
  FOR ALL TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS durable_execution_outbox_consumer_ops_scope ON vira.durable_execution_outbox_consumer;
CREATE POLICY durable_execution_outbox_consumer_ops_scope ON vira.durable_execution_outbox_consumer
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));

REVOKE ALL ON TABLE vira.durable_execution_state FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT ON TABLE vira.durable_execution_state TO vira_api, vira_worker, vira_ops;
GRANT INSERT ON TABLE vira.durable_execution_state TO vira_worker;
GRANT UPDATE (revision, status, lease_epoch, lease_worker_id, lease_expires_at, dispatch_state, record, persistence_updated_at)
  ON TABLE vira.durable_execution_state TO vira_worker;

REVOKE ALL ON TABLE vira.durable_execution_nonce FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.durable_execution_nonce TO vira_worker;
GRANT SELECT ON TABLE vira.durable_execution_nonce TO vira_ops;

REVOKE ALL ON TABLE vira.durable_execution_idempotency_reservation FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.durable_execution_idempotency_reservation TO vira_worker;
GRANT SELECT ON TABLE vira.durable_execution_idempotency_reservation TO vira_ops;

REVOKE ALL ON TABLE vira.durable_execution_effect_reservation FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.durable_execution_effect_reservation TO vira_worker;
GRANT SELECT ON TABLE vira.durable_execution_effect_reservation TO vira_ops;

REVOKE ALL ON TABLE vira.durable_execution_outbox FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT ON TABLE vira.durable_execution_outbox TO vira_api, vira_worker, vira_ops;
GRANT INSERT ON TABLE vira.durable_execution_outbox TO vira_worker;

REVOKE ALL ON TABLE vira.durable_execution_outbox_consumer FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.durable_execution_outbox_consumer TO vira_worker;
GRANT SELECT ON TABLE vira.durable_execution_outbox_consumer TO vira_ops;

SELECT set_config('vira.migration_checksum', :'migration_checksum', true);
DO $vira_migration_record$
DECLARE
  existing_checksum text;
BEGIN
  SELECT checksum INTO existing_checksum
  FROM vira.schema_migrations
  WHERE version = 6;

  IF existing_checksum IS NULL THEN
    INSERT INTO vira.schema_migrations(version, name, checksum)
    VALUES (6, 'prod12_durable_execution', current_setting('vira.migration_checksum'));
  ELSIF existing_checksum <> current_setting('vira.migration_checksum') THEN
    RAISE EXCEPTION 'migration checksum mismatch for version 6';
  END IF;
END
$vira_migration_record$;

COMMIT;
