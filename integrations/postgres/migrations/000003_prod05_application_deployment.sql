\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('vira:schema-migrations', 0));
SET LOCAL ROLE vira_migration;

CREATE TABLE IF NOT EXISTS vira.application_release (
  publisher_organization_id text NOT NULL,
  publisher_project_id text NOT NULL,
  application_id text NOT NULL,
  application_version text NOT NULL,
  distribution_digest char(64) NOT NULL,
  artifact_id text NOT NULL UNIQUE,
  publisher_id text NOT NULL,
  distribution jsonb NOT NULL,
  provenance jsonb NOT NULL,
  signature jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (application_id, application_version),
  UNIQUE (publisher_organization_id, application_id, application_version, distribution_digest),
  UNIQUE (publisher_organization_id, application_id, application_version, distribution_digest, artifact_id),
  CONSTRAINT application_release_digest CHECK (distribution_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT application_release_status CHECK (status IN ('active', 'deprecated')),
  CONSTRAINT application_release_identity_nonempty CHECK (length(application_id) BETWEEN 1 AND 512 AND length(application_version) BETWEEN 1 AND 64),
  CONSTRAINT application_release_publisher_nonempty CHECK (length(publisher_id) BETWEEN 1 AND 256)
);
ALTER TABLE vira.application_release OWNER TO vira_migration;

CREATE TABLE IF NOT EXISTS vira.application_deployment (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  application_id text NOT NULL,
  revision bigint NOT NULL,
  deployment_id text NOT NULL UNIQUE,
  application_version text NOT NULL,
  distribution_digest char(64) NOT NULL,
  artifact_id text NOT NULL,
  publisher_organization_id text NOT NULL,
  binding jsonb NOT NULL,
  operation text NOT NULL,
  previous_deployment_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, application_id, revision),
  UNIQUE (organization_id, project_id, environment, application_id, deployment_id),
  UNIQUE (
    organization_id,
    project_id,
    environment,
    application_id,
    deployment_id,
    revision,
    application_version,
    distribution_digest,
    artifact_id
  ),
  FOREIGN KEY (publisher_organization_id, application_id, application_version, distribution_digest, artifact_id)
    REFERENCES vira.application_release (publisher_organization_id, application_id, application_version, distribution_digest, artifact_id),
  FOREIGN KEY (organization_id, project_id, environment, application_id, previous_deployment_id)
    REFERENCES vira.application_deployment (organization_id, project_id, environment, application_id, deployment_id),
  CONSTRAINT application_deployment_revision CHECK (revision > 0),
  CONSTRAINT application_deployment_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT application_deployment_digest CHECK (distribution_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT application_deployment_operation CHECK (operation IN ('publish', 'promote', 'rollback')),
  CONSTRAINT application_deployment_publisher_scope CHECK (publisher_organization_id = organization_id)
);
ALTER TABLE vira.application_deployment OWNER TO vira_migration;

CREATE TABLE IF NOT EXISTS vira.application_activation (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  application_id text NOT NULL,
  deployment_id text NOT NULL UNIQUE,
  revision bigint NOT NULL,
  application_version text NOT NULL,
  distribution_digest char(64) NOT NULL,
  artifact_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, application_id),
  FOREIGN KEY (
    organization_id,
    project_id,
    environment,
    application_id,
    deployment_id,
    revision,
    application_version,
    distribution_digest,
    artifact_id
  ) REFERENCES vira.application_deployment (
    organization_id,
    project_id,
    environment,
    application_id,
    deployment_id,
    revision,
    application_version,
    distribution_digest,
    artifact_id
  ),
  CONSTRAINT application_activation_revision CHECK (revision > 0),
  CONSTRAINT application_activation_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT application_activation_digest CHECK (distribution_digest ~ '^[0-9a-f]{64}$')
);
ALTER TABLE vira.application_activation OWNER TO vira_migration;

CREATE INDEX IF NOT EXISTS application_release_org_idx
  ON vira.application_release (publisher_organization_id, application_id, application_version);
CREATE INDEX IF NOT EXISTS application_deployment_history_idx
  ON vira.application_deployment (organization_id, project_id, environment, application_id, revision DESC);
CREATE INDEX IF NOT EXISTS application_activation_release_idx
  ON vira.application_activation (organization_id, project_id, environment, application_id, application_version);

ALTER TABLE vira.application_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.application_release FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.application_deployment ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.application_deployment FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.application_activation ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.application_activation FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_release_read_scope ON vira.application_release;
CREATE POLICY application_release_read_scope ON vira.application_release
  FOR SELECT TO vira_api, vira_worker, vira_ops
  USING (publisher_organization_id = vira.current_organization_id());

DROP POLICY IF EXISTS application_release_insert_scope ON vira.application_release;
CREATE POLICY application_release_insert_scope ON vira.application_release
  FOR INSERT TO vira_api
  WITH CHECK (
    publisher_organization_id = vira.current_organization_id()
    AND publisher_project_id = vira.current_project_id()
  );

DROP POLICY IF EXISTS application_release_update_scope ON vira.application_release;
CREATE POLICY application_release_update_scope ON vira.application_release
  FOR UPDATE TO vira_api
  USING (
    publisher_organization_id = vira.current_organization_id()
    AND publisher_project_id = vira.current_project_id()
  )
  WITH CHECK (
    publisher_organization_id = vira.current_organization_id()
    AND publisher_project_id = vira.current_project_id()
  );

DROP POLICY IF EXISTS application_deployment_scope ON vira.application_deployment;
CREATE POLICY application_deployment_scope ON vira.application_deployment
  TO vira_api, vira_worker, vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS application_activation_scope ON vira.application_activation;
CREATE POLICY application_activation_scope ON vira.application_activation
  TO vira_api, vira_worker, vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));

REVOKE ALL ON TABLE vira.application_release, vira.application_deployment, vira.application_activation
  FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.application_release TO vira_api;
GRANT UPDATE (status, updated_at) ON TABLE vira.application_release TO vira_api;
GRANT SELECT, INSERT ON TABLE vira.application_deployment TO vira_api;
GRANT SELECT, INSERT ON TABLE vira.application_activation TO vira_api;
GRANT UPDATE (deployment_id, revision, application_version, distribution_digest, artifact_id, updated_at)
  ON TABLE vira.application_activation TO vira_api;
GRANT SELECT ON TABLE vira.application_release, vira.application_deployment, vira.application_activation TO vira_worker, vira_ops;

SELECT set_config('vira.migration_checksum', :'migration_checksum', true);
DO $vira_migration_record$
DECLARE
  existing_checksum text;
BEGIN
  SELECT checksum INTO existing_checksum
  FROM vira.schema_migrations
  WHERE version = 3;

  IF existing_checksum IS NULL THEN
    INSERT INTO vira.schema_migrations(version, name, checksum)
    VALUES (3, 'prod05_application_deployment', current_setting('vira.migration_checksum'));
  ELSIF existing_checksum <> current_setting('vira.migration_checksum') THEN
    RAISE EXCEPTION 'migration checksum mismatch for version 3';
  END IF;
END
$vira_migration_record$;

COMMIT;
