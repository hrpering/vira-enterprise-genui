\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('vira:schema-migrations', 0));
SET LOCAL ROLE vira_migration;

CREATE TABLE IF NOT EXISTS vira.hosted_capability_job_state (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  job_id text NOT NULL,
  revision bigint NOT NULL,
  status text NOT NULL,
  record jsonb NOT NULL,
  persistence_created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  persistence_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, job_id),
  CONSTRAINT hosted_capability_job_state_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT hosted_capability_job_state_revision CHECK (revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT hosted_capability_job_state_status CHECK (status IN ('running', 'cancel-requested', 'completed', 'failed', 'timed-out', 'cancelled')),
  CONSTRAINT hosted_capability_job_state_id_nonempty CHECK (length(job_id) BETWEEN 1 AND 256),
  CONSTRAINT hosted_capability_job_state_record_object CHECK ((jsonb_typeof(record) = 'object') IS TRUE),
  CONSTRAINT hosted_capability_job_state_record_scope_object CHECK ((jsonb_typeof(record -> 'scope') = 'object') IS TRUE),
  CONSTRAINT hosted_capability_job_state_record_version CHECK ((record ->> 'version' = '1') IS TRUE),
  CONSTRAINT hosted_capability_job_state_record_id CHECK ((record ->> 'id' = job_id) IS TRUE),
  CONSTRAINT hosted_capability_job_state_record_revision CHECK (((record -> 'revision') = to_jsonb(revision)) IS TRUE),
  CONSTRAINT hosted_capability_job_state_record_status CHECK ((record ->> 'status' = status) IS TRUE),
  CONSTRAINT hosted_capability_job_state_record_scope_version CHECK ((record -> 'scope' ->> 'version' = '1') IS TRUE),
  CONSTRAINT hosted_capability_job_state_record_scope_organization CHECK ((record -> 'scope' ->> 'organizationId' = organization_id) IS TRUE),
  CONSTRAINT hosted_capability_job_state_record_scope_project CHECK ((record -> 'scope' ->> 'projectId' = project_id) IS TRUE),
  CONSTRAINT hosted_capability_job_state_record_scope_environment CHECK ((record -> 'scope' ->> 'environment' = environment) IS TRUE)
);
ALTER TABLE vira.hosted_capability_job_state OWNER TO vira_migration;

CREATE INDEX IF NOT EXISTS hosted_capability_job_state_status_idx
  ON vira.hosted_capability_job_state (organization_id, project_id, environment, status, persistence_updated_at);

ALTER TABLE vira.hosted_capability_job_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.hosted_capability_job_state FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hosted_capability_job_state_read_scope ON vira.hosted_capability_job_state;
CREATE POLICY hosted_capability_job_state_read_scope ON vira.hosted_capability_job_state
  FOR SELECT TO vira_api, vira_worker, vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS hosted_capability_job_state_insert_scope ON vira.hosted_capability_job_state;
CREATE POLICY hosted_capability_job_state_insert_scope ON vira.hosted_capability_job_state
  FOR INSERT TO vira_worker
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS hosted_capability_job_state_update_scope ON vira.hosted_capability_job_state;
CREATE POLICY hosted_capability_job_state_update_scope ON vira.hosted_capability_job_state
  FOR UPDATE TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));

REVOKE ALL ON TABLE vira.hosted_capability_job_state
  FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT ON TABLE vira.hosted_capability_job_state
  TO vira_api, vira_worker, vira_ops;
GRANT INSERT ON TABLE vira.hosted_capability_job_state
  TO vira_worker;
GRANT UPDATE (revision, status, record, persistence_updated_at) ON TABLE vira.hosted_capability_job_state
  TO vira_worker;

SELECT set_config('vira.migration_checksum', :'migration_checksum', true);
DO $vira_migration_record$
DECLARE
  existing_checksum text;
BEGIN
  SELECT checksum INTO existing_checksum
  FROM vira.schema_migrations
  WHERE version = 5;

  IF existing_checksum IS NULL THEN
    INSERT INTO vira.schema_migrations(version, name, checksum)
    VALUES (5, 'prod09_async_capability_job', current_setting('vira.migration_checksum'));
  ELSIF existing_checksum <> current_setting('vira.migration_checksum') THEN
    RAISE EXCEPTION 'migration checksum mismatch for version 5';
  END IF;
END
$vira_migration_record$;

COMMIT;
