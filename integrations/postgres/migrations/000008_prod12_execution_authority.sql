\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('vira:schema-migrations', 0));
SET LOCAL ROLE vira_migration;

CREATE TABLE IF NOT EXISTS vira.durable_execution_authority (
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
  authority jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, execution_id),
  CONSTRAINT durable_execution_authority_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT durable_execution_authority_plan_digest CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT durable_execution_authority_plan_revision CHECK (plan_revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT durable_execution_authority_nonempty CHECK (
    length(execution_id) BETWEEN 1 AND 512
    AND length(transaction_id) BETWEEN 1 AND 512
    AND length(operation_id) BETWEEN 1 AND 512
    AND length(grant_id) BETWEEN 1 AND 512
    AND length(grant_nonce) BETWEEN 1 AND 512
  ),
  CONSTRAINT durable_execution_authority_object CHECK ((jsonb_typeof(authority) = 'object') IS TRUE),
  CONSTRAINT durable_execution_authority_scope_object CHECK ((jsonb_typeof(authority -> 'scope') = 'object') IS TRUE),
  CONSTRAINT durable_execution_authority_frozen_object CHECK ((jsonb_typeof(authority -> 'frozen') = 'object') IS TRUE),
  CONSTRAINT durable_execution_authority_grant_object CHECK ((jsonb_typeof(authority -> 'grant') = 'object') IS TRUE),
  CONSTRAINT durable_execution_authority_version CHECK ((authority ->> 'version' = '1') IS TRUE),
  CONSTRAINT durable_execution_authority_execution CHECK ((authority ->> 'executionId' = execution_id) IS TRUE),
  CONSTRAINT durable_execution_authority_transaction CHECK ((authority ->> 'transactionId' = transaction_id) IS TRUE),
  CONSTRAINT durable_execution_authority_digest CHECK ((authority ->> 'planDigest' = plan_digest) IS TRUE),
  CONSTRAINT durable_execution_authority_revision CHECK (((authority -> 'planRevision') = to_jsonb(plan_revision)) IS TRUE),
  CONSTRAINT durable_execution_authority_operation CHECK ((authority ->> 'operationId' = operation_id) IS TRUE),
  CONSTRAINT durable_execution_authority_grant_id CHECK ((authority ->> 'grantId' = grant_id) IS TRUE),
  CONSTRAINT durable_execution_authority_nonce CHECK ((authority ->> 'grantNonce' = grant_nonce) IS TRUE),
  CONSTRAINT durable_execution_authority_scope_organization CHECK ((authority -> 'scope' ->> 'organizationId' = organization_id) IS TRUE),
  CONSTRAINT durable_execution_authority_scope_project CHECK ((authority -> 'scope' ->> 'projectId' = project_id) IS TRUE),
  CONSTRAINT durable_execution_authority_scope_environment CHECK ((authority -> 'scope' ->> 'environment' = environment) IS TRUE),
  FOREIGN KEY (organization_id, project_id, environment, execution_id)
    REFERENCES vira.durable_execution_state (organization_id, project_id, environment, execution_id)
    ON DELETE RESTRICT
);
ALTER TABLE vira.durable_execution_authority OWNER TO vira_migration;

ALTER TABLE vira.durable_execution_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_authority FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS durable_execution_authority_worker_scope ON vira.durable_execution_authority;
CREATE POLICY durable_execution_authority_worker_scope ON vira.durable_execution_authority
  FOR ALL TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS durable_execution_authority_ops_scope ON vira.durable_execution_authority;
CREATE POLICY durable_execution_authority_ops_scope ON vira.durable_execution_authority
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));

REVOKE ALL ON TABLE vira.durable_execution_authority FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.durable_execution_authority TO vira_worker;
GRANT SELECT ON TABLE vira.durable_execution_authority TO vira_ops;

SELECT set_config('vira.migration_checksum', :'migration_checksum', true);
DO $vira_migration_record$
DECLARE
  existing_checksum text;
BEGIN
  SELECT checksum INTO existing_checksum
  FROM vira.schema_migrations
  WHERE version = 8;

  IF existing_checksum IS NULL THEN
    INSERT INTO vira.schema_migrations(version, name, checksum)
    VALUES (8, 'prod12_execution_authority', current_setting('vira.migration_checksum'));
  ELSIF existing_checksum <> current_setting('vira.migration_checksum') THEN
    RAISE EXCEPTION 'migration checksum mismatch for version 8';
  END IF;
END
$vira_migration_record$;

COMMIT;
