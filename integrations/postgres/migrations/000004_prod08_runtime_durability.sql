\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('vira:schema-migrations', 0));
SET LOCAL ROLE vira_migration;

CREATE TABLE IF NOT EXISTS vira.application_run_state (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  run_id text NOT NULL,
  revision bigint NOT NULL,
  status text NOT NULL,
  record jsonb NOT NULL,
  persistence_created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  persistence_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, run_id),
  CONSTRAINT application_run_state_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT application_run_state_revision CHECK (revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT application_run_state_status CHECK (status IN ('running', 'waiting', 'paused', 'completed', 'failed')),
  CONSTRAINT application_run_state_id_nonempty CHECK (length(run_id) BETWEEN 1 AND 128),
  CONSTRAINT application_run_state_record_object CHECK ((jsonb_typeof(record) = 'object') IS TRUE),
  CONSTRAINT application_run_state_record_scope_object CHECK ((jsonb_typeof(record -> 'scope') = 'object') IS TRUE),
  CONSTRAINT application_run_state_record_version CHECK ((record ->> 'version' = '1') IS TRUE),
  CONSTRAINT application_run_state_record_id CHECK ((record ->> 'id' = run_id) IS TRUE),
  CONSTRAINT application_run_state_record_revision CHECK (((record -> 'revision') = to_jsonb(revision)) IS TRUE),
  CONSTRAINT application_run_state_record_status CHECK ((record ->> 'status' = status) IS TRUE),
  CONSTRAINT application_run_state_record_scope_version CHECK ((record -> 'scope' ->> 'version' = '1') IS TRUE),
  CONSTRAINT application_run_state_record_scope_organization CHECK ((record -> 'scope' ->> 'organizationId' = organization_id) IS TRUE),
  CONSTRAINT application_run_state_record_scope_project CHECK ((record -> 'scope' ->> 'projectId' = project_id) IS TRUE),
  CONSTRAINT application_run_state_record_scope_environment CHECK ((record -> 'scope' ->> 'environment' = environment) IS TRUE)
);
ALTER TABLE vira.application_run_state OWNER TO vira_migration;

CREATE TABLE IF NOT EXISTS vira.human_task_state (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  task_id text NOT NULL,
  revision bigint NOT NULL,
  status text NOT NULL,
  record jsonb NOT NULL,
  persistence_created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  persistence_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, task_id),
  CONSTRAINT human_task_state_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT human_task_state_revision CHECK (revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT human_task_state_status CHECK (status IN ('assigned', 'claimed', 'completed', 'expired')),
  CONSTRAINT human_task_state_id_nonempty CHECK (length(task_id) BETWEEN 1 AND 128),
  CONSTRAINT human_task_state_record_object CHECK ((jsonb_typeof(record) = 'object') IS TRUE),
  CONSTRAINT human_task_state_record_scope_object CHECK ((jsonb_typeof(record -> 'scope') = 'object') IS TRUE),
  CONSTRAINT human_task_state_record_version CHECK ((record ->> 'version' = '1') IS TRUE),
  CONSTRAINT human_task_state_record_id CHECK ((record ->> 'id' = task_id) IS TRUE),
  CONSTRAINT human_task_state_record_revision CHECK (((record -> 'revision') = to_jsonb(revision)) IS TRUE),
  CONSTRAINT human_task_state_record_status CHECK ((record ->> 'status' = status) IS TRUE),
  CONSTRAINT human_task_state_record_scope_version CHECK ((record -> 'scope' ->> 'version' = '1') IS TRUE),
  CONSTRAINT human_task_state_record_scope_organization CHECK ((record -> 'scope' ->> 'organizationId' = organization_id) IS TRUE),
  CONSTRAINT human_task_state_record_scope_project CHECK ((record -> 'scope' ->> 'projectId' = project_id) IS TRUE),
  CONSTRAINT human_task_state_record_scope_environment CHECK ((record -> 'scope' ->> 'environment' = environment) IS TRUE)
);
ALTER TABLE vira.human_task_state OWNER TO vira_migration;

CREATE TABLE IF NOT EXISTS vira.trigger_inbox_state (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  source_ref text NOT NULL,
  event_id text NOT NULL,
  revision bigint NOT NULL,
  status text NOT NULL,
  record jsonb NOT NULL,
  persistence_created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  persistence_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, source_ref, event_id),
  CONSTRAINT trigger_inbox_state_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT trigger_inbox_state_revision CHECK (revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT trigger_inbox_state_status CHECK (status IN ('pending', 'processing', 'processed')),
  CONSTRAINT trigger_inbox_state_source_nonempty CHECK (length(source_ref) BETWEEN 1 AND 512),
  CONSTRAINT trigger_inbox_state_event_nonempty CHECK (length(event_id) BETWEEN 1 AND 512),
  CONSTRAINT trigger_inbox_state_record_object CHECK ((jsonb_typeof(record) = 'object') IS TRUE),
  CONSTRAINT trigger_inbox_state_record_scope_object CHECK ((jsonb_typeof(record -> 'scope') = 'object') IS TRUE),
  CONSTRAINT trigger_inbox_state_record_version CHECK ((record ->> 'version' = '1') IS TRUE),
  CONSTRAINT trigger_inbox_state_record_source CHECK ((record ->> 'sourceRef' = source_ref) IS TRUE),
  CONSTRAINT trigger_inbox_state_record_event CHECK ((record ->> 'eventId' = event_id) IS TRUE),
  CONSTRAINT trigger_inbox_state_record_revision CHECK (((record -> 'revision') = to_jsonb(revision)) IS TRUE),
  CONSTRAINT trigger_inbox_state_record_status CHECK ((record ->> 'status' = status) IS TRUE),
  CONSTRAINT trigger_inbox_state_record_scope_version CHECK ((record -> 'scope' ->> 'version' = '1') IS TRUE),
  CONSTRAINT trigger_inbox_state_record_scope_organization CHECK ((record -> 'scope' ->> 'organizationId' = organization_id) IS TRUE),
  CONSTRAINT trigger_inbox_state_record_scope_project CHECK ((record -> 'scope' ->> 'projectId' = project_id) IS TRUE),
  CONSTRAINT trigger_inbox_state_record_scope_environment CHECK ((record -> 'scope' ->> 'environment' = environment) IS TRUE)
);
ALTER TABLE vira.trigger_inbox_state OWNER TO vira_migration;

CREATE INDEX IF NOT EXISTS application_run_state_status_idx
  ON vira.application_run_state (organization_id, project_id, environment, status, persistence_updated_at);
CREATE INDEX IF NOT EXISTS human_task_state_status_idx
  ON vira.human_task_state (organization_id, project_id, environment, status, persistence_updated_at);
CREATE INDEX IF NOT EXISTS trigger_inbox_state_status_idx
  ON vira.trigger_inbox_state (organization_id, project_id, environment, status, persistence_updated_at);

ALTER TABLE vira.application_run_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.application_run_state FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.human_task_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.human_task_state FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.trigger_inbox_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.trigger_inbox_state FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_run_state_read_scope ON vira.application_run_state;
CREATE POLICY application_run_state_read_scope ON vira.application_run_state
  FOR SELECT TO vira_api, vira_worker, vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS application_run_state_insert_scope ON vira.application_run_state;
CREATE POLICY application_run_state_insert_scope ON vira.application_run_state
  FOR INSERT TO vira_worker
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS application_run_state_update_scope ON vira.application_run_state;
CREATE POLICY application_run_state_update_scope ON vira.application_run_state
  FOR UPDATE TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS human_task_state_read_scope ON vira.human_task_state;
CREATE POLICY human_task_state_read_scope ON vira.human_task_state
  FOR SELECT TO vira_api, vira_worker, vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS human_task_state_insert_scope ON vira.human_task_state;
CREATE POLICY human_task_state_insert_scope ON vira.human_task_state
  FOR INSERT TO vira_worker
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS human_task_state_update_scope ON vira.human_task_state;
CREATE POLICY human_task_state_update_scope ON vira.human_task_state
  FOR UPDATE TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS trigger_inbox_state_read_scope ON vira.trigger_inbox_state;
CREATE POLICY trigger_inbox_state_read_scope ON vira.trigger_inbox_state
  FOR SELECT TO vira_api, vira_worker, vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS trigger_inbox_state_insert_scope ON vira.trigger_inbox_state;
CREATE POLICY trigger_inbox_state_insert_scope ON vira.trigger_inbox_state
  FOR INSERT TO vira_worker
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS trigger_inbox_state_update_scope ON vira.trigger_inbox_state;
CREATE POLICY trigger_inbox_state_update_scope ON vira.trigger_inbox_state
  FOR UPDATE TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));

REVOKE ALL ON TABLE vira.application_run_state, vira.human_task_state, vira.trigger_inbox_state
  FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT ON TABLE vira.application_run_state, vira.human_task_state, vira.trigger_inbox_state
  TO vira_api, vira_worker, vira_ops;
GRANT INSERT ON TABLE vira.application_run_state, vira.human_task_state, vira.trigger_inbox_state
  TO vira_worker;
GRANT UPDATE (revision, status, record, persistence_updated_at) ON TABLE vira.application_run_state
  TO vira_worker;
GRANT UPDATE (revision, status, record, persistence_updated_at) ON TABLE vira.human_task_state
  TO vira_worker;
GRANT UPDATE (revision, status, record, persistence_updated_at) ON TABLE vira.trigger_inbox_state
  TO vira_worker;

SELECT set_config('vira.migration_checksum', :'migration_checksum', true);
DO $vira_migration_record$
DECLARE
  existing_checksum text;
BEGIN
  SELECT checksum INTO existing_checksum
  FROM vira.schema_migrations
  WHERE version = 4;

  IF existing_checksum IS NULL THEN
    INSERT INTO vira.schema_migrations(version, name, checksum)
    VALUES (4, 'prod08_runtime_durability', current_setting('vira.migration_checksum'));
  ELSIF existing_checksum <> current_setting('vira.migration_checksum') THEN
    RAISE EXCEPTION 'migration checksum mismatch for version 4';
  END IF;
END
$vira_migration_record$;

COMMIT;
