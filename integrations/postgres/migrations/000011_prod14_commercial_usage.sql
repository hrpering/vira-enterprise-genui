\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('vira:schema-migrations', 0));
SET LOCAL ROLE vira_migration;

CREATE TABLE IF NOT EXISTS vira.commercial_usage_source_event (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  source_event_id text NOT NULL,
  source_kind text NOT NULL,
  verification_id text NOT NULL,
  execution_id text NOT NULL,
  transaction_id text NOT NULL,
  operation_id text NOT NULL,
  attempt_id text NOT NULL,
  application_id text NOT NULL,
  application_version text NOT NULL,
  application_digest text NOT NULL,
  entitlement_id text NOT NULL,
  entitlement_version text NOT NULL,
  metering_id text NOT NULL,
  metering_version text NOT NULL,
  quantity bigint NOT NULL,
  occurred_at timestamptz NOT NULL,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, source_event_id),
  CONSTRAINT commercial_usage_source_event_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT commercial_usage_source_event_kind CHECK (source_kind = 'action.effect.verified'),
  CONSTRAINT commercial_usage_source_event_application_digest CHECK (application_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT commercial_usage_source_event_quantity CHECK (quantity BETWEEN 1 AND 9007199254740991),
  CONSTRAINT commercial_usage_source_event_nonempty CHECK (
    length(source_event_id) BETWEEN 1 AND 255
    AND length(verification_id) BETWEEN 1 AND 512
    AND length(execution_id) BETWEEN 1 AND 512
    AND length(transaction_id) BETWEEN 1 AND 512
    AND length(operation_id) BETWEEN 1 AND 512
    AND length(attempt_id) BETWEEN 1 AND 512
    AND length(application_id) BETWEEN 1 AND 255
    AND length(application_version) BETWEEN 1 AND 64
    AND length(entitlement_id) BETWEEN 1 AND 255
    AND length(entitlement_version) BETWEEN 1 AND 128
    AND length(metering_id) BETWEEN 1 AND 255
    AND length(metering_version) BETWEEN 1 AND 128
  ),
  CONSTRAINT commercial_usage_source_event_json_object CHECK ((jsonb_typeof(event) = 'object') IS TRUE),
  CONSTRAINT commercial_usage_source_event_json_version CHECK ((event ->> 'version' = '1') IS TRUE),
  CONSTRAINT commercial_usage_source_event_json_id CHECK ((event ->> 'sourceEventId' = source_event_id) IS TRUE),
  CONSTRAINT commercial_usage_source_event_json_kind CHECK ((event ->> 'sourceKind' = source_kind) IS TRUE),
  CONSTRAINT commercial_usage_source_event_scope_organization CHECK ((event -> 'scope' ->> 'organizationId' = organization_id) IS TRUE),
  CONSTRAINT commercial_usage_source_event_scope_project CHECK ((event -> 'scope' ->> 'projectId' = project_id) IS TRUE),
  CONSTRAINT commercial_usage_source_event_scope_environment CHECK ((event -> 'scope' ->> 'environment' = environment) IS TRUE),
  CONSTRAINT commercial_usage_source_event_verification CHECK ((event -> 'authority' ->> 'verificationId' = verification_id) IS TRUE),
  CONSTRAINT commercial_usage_source_event_execution CHECK ((event -> 'authority' ->> 'executionId' = execution_id) IS TRUE),
  CONSTRAINT commercial_usage_source_event_transaction CHECK ((event -> 'authority' ->> 'transactionId' = transaction_id) IS TRUE),
  CONSTRAINT commercial_usage_source_event_operation CHECK ((event -> 'authority' ->> 'operationId' = operation_id) IS TRUE),
  CONSTRAINT commercial_usage_source_event_attempt CHECK ((event -> 'authority' ->> 'attemptId' = attempt_id) IS TRUE),
  CONSTRAINT commercial_usage_source_event_application CHECK ((event ->> 'applicationId' = application_id) IS TRUE),
  CONSTRAINT commercial_usage_source_event_application_version CHECK ((event ->> 'applicationVersion' = application_version) IS TRUE),
  CONSTRAINT commercial_usage_source_event_application_digest_json CHECK ((event ->> 'applicationDigest' = application_digest) IS TRUE),
  CONSTRAINT commercial_usage_source_event_entitlement_id CHECK ((event -> 'entitlementRef' ->> 'id' = entitlement_id) IS TRUE),
  CONSTRAINT commercial_usage_source_event_entitlement_version CHECK ((event -> 'entitlementRef' ->> 'versionRef' = entitlement_version) IS TRUE),
  CONSTRAINT commercial_usage_source_event_metering_id CHECK ((event -> 'meteringRef' ->> 'id' = metering_id) IS TRUE),
  CONSTRAINT commercial_usage_source_event_metering_version CHECK ((event -> 'meteringRef' ->> 'versionRef' = metering_version) IS TRUE),
  CONSTRAINT commercial_usage_source_event_quantity_json CHECK (((event -> 'quantity') = to_jsonb(quantity)) IS TRUE),
  FOREIGN KEY (organization_id, project_id, environment, verification_id)
    REFERENCES vira.action_verification_state (organization_id, project_id, environment, verification_id)
    ON DELETE RESTRICT
);
ALTER TABLE vira.commercial_usage_source_event OWNER TO vira_migration;

CREATE UNIQUE INDEX IF NOT EXISTS commercial_usage_source_verification_meter_idx
  ON vira.commercial_usage_source_event (
    organization_id, project_id, environment,
    verification_id, metering_id, metering_version
  );
CREATE INDEX IF NOT EXISTS commercial_usage_source_time_idx
  ON vira.commercial_usage_source_event (
    organization_id, project_id, environment, occurred_at, source_event_id
  );

CREATE TABLE IF NOT EXISTS vira.commercial_usage_record (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  usage_id text NOT NULL,
  source_event_id text NOT NULL,
  source_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  application_id text NOT NULL,
  application_version text NOT NULL,
  entitlement_id text NOT NULL,
  entitlement_version text NOT NULL,
  metering_id text NOT NULL,
  metering_version text NOT NULL,
  principal_kind text NOT NULL,
  principal_id text NOT NULL,
  capability_id text,
  capability_version text,
  location_id text,
  quantity bigint NOT NULL,
  usage_record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, usage_id),
  UNIQUE (organization_id, project_id, environment, source_event_id),
  CONSTRAINT commercial_usage_record_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT commercial_usage_record_quantity CHECK (quantity BETWEEN 1 AND 9007199254740991),
  CONSTRAINT commercial_usage_record_nonempty CHECK (
    length(usage_id) BETWEEN 1 AND 255
    AND length(source_event_id) BETWEEN 1 AND 255
    AND length(source_id) BETWEEN 1 AND 255
    AND length(application_id) BETWEEN 1 AND 255
    AND length(application_version) BETWEEN 1 AND 64
    AND length(entitlement_id) BETWEEN 1 AND 255
    AND length(entitlement_version) BETWEEN 1 AND 128
    AND length(metering_id) BETWEEN 1 AND 255
    AND length(metering_version) BETWEEN 1 AND 128
    AND length(principal_kind) BETWEEN 1 AND 64
    AND length(principal_id) BETWEEN 1 AND 512
    AND (capability_id IS NULL OR length(capability_id) BETWEEN 1 AND 255)
    AND (capability_version IS NULL OR length(capability_version) BETWEEN 1 AND 128)
    AND (location_id IS NULL OR length(location_id) BETWEEN 1 AND 255)
  ),
  CONSTRAINT commercial_usage_record_capability_pair CHECK ((capability_id IS NULL) = (capability_version IS NULL)),
  CONSTRAINT commercial_usage_record_json_object CHECK ((jsonb_typeof(usage_record) = 'object') IS TRUE),
  CONSTRAINT commercial_usage_record_json_id CHECK ((usage_record ->> 'usageId' = usage_id) IS TRUE),
  CONSTRAINT commercial_usage_record_json_source CHECK ((usage_record ->> 'sourceId' = source_id) IS TRUE),
  CONSTRAINT commercial_usage_record_scope_organization CHECK ((usage_record -> 'scope' ->> 'organizationId' = organization_id) IS TRUE),
  CONSTRAINT commercial_usage_record_scope_project CHECK ((usage_record -> 'scope' ->> 'projectId' = project_id) IS TRUE),
  CONSTRAINT commercial_usage_record_scope_environment CHECK ((usage_record -> 'scope' ->> 'environment' = environment) IS TRUE),
  CONSTRAINT commercial_usage_record_application CHECK ((usage_record ->> 'applicationId' = application_id) IS TRUE),
  CONSTRAINT commercial_usage_record_application_version_json CHECK ((usage_record ->> 'applicationVersion' = application_version) IS TRUE),
  CONSTRAINT commercial_usage_record_entitlement_id CHECK ((usage_record -> 'entitlementRef' ->> 'id' = entitlement_id) IS TRUE),
  CONSTRAINT commercial_usage_record_entitlement_version CHECK ((usage_record -> 'entitlementRef' ->> 'versionRef' = entitlement_version) IS TRUE),
  CONSTRAINT commercial_usage_record_metering_id CHECK ((usage_record -> 'meteringRef' ->> 'id' = metering_id) IS TRUE),
  CONSTRAINT commercial_usage_record_metering_version CHECK ((usage_record -> 'meteringRef' ->> 'versionRef' = metering_version) IS TRUE),
  CONSTRAINT commercial_usage_record_principal_kind CHECK ((usage_record -> 'principal' ->> 'kind' = principal_kind) IS TRUE),
  CONSTRAINT commercial_usage_record_principal_id CHECK ((usage_record -> 'principal' ->> 'id' = principal_id) IS TRUE),
  CONSTRAINT commercial_usage_record_quantity_json CHECK (((usage_record -> 'quantity') = to_jsonb(quantity)) IS TRUE),
  FOREIGN KEY (organization_id, project_id, environment, source_event_id)
    REFERENCES vira.commercial_usage_source_event (organization_id, project_id, environment, source_event_id)
    ON DELETE RESTRICT
);
ALTER TABLE vira.commercial_usage_record OWNER TO vira_migration;

CREATE INDEX IF NOT EXISTS commercial_usage_record_meter_window_idx
  ON vira.commercial_usage_record (
    organization_id, project_id, environment,
    application_id, application_version,
    entitlement_id, entitlement_version,
    metering_id, metering_version,
    occurred_at, usage_id
  );

ALTER TABLE vira.commercial_usage_source_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.commercial_usage_source_event FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.commercial_usage_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.commercial_usage_record FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_usage_source_event_worker_read_scope ON vira.commercial_usage_source_event;
CREATE POLICY commercial_usage_source_event_worker_read_scope ON vira.commercial_usage_source_event
  FOR SELECT TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS commercial_usage_source_event_worker_insert_scope ON vira.commercial_usage_source_event;
CREATE POLICY commercial_usage_source_event_worker_insert_scope ON vira.commercial_usage_source_event
  FOR INSERT TO vira_worker
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS commercial_usage_source_event_ops_scope ON vira.commercial_usage_source_event;
CREATE POLICY commercial_usage_source_event_ops_scope ON vira.commercial_usage_source_event
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS commercial_usage_record_worker_read_scope ON vira.commercial_usage_record;
CREATE POLICY commercial_usage_record_worker_read_scope ON vira.commercial_usage_record
  FOR SELECT TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS commercial_usage_record_worker_insert_scope ON vira.commercial_usage_record;
CREATE POLICY commercial_usage_record_worker_insert_scope ON vira.commercial_usage_record
  FOR INSERT TO vira_worker
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS commercial_usage_record_ops_scope ON vira.commercial_usage_record;
CREATE POLICY commercial_usage_record_ops_scope ON vira.commercial_usage_record
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));

REVOKE ALL ON TABLE vira.commercial_usage_source_event FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.commercial_usage_source_event TO vira_worker;
GRANT SELECT ON TABLE vira.commercial_usage_source_event TO vira_ops;

REVOKE ALL ON TABLE vira.commercial_usage_record FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.commercial_usage_record TO vira_worker;
GRANT SELECT ON TABLE vira.commercial_usage_record TO vira_ops;

SELECT set_config('vira.migration_checksum', :'migration_checksum', true);
DO $vira_migration_record$
DECLARE
  existing_checksum text;
BEGIN
  SELECT checksum INTO existing_checksum
  FROM vira.schema_migrations
  WHERE version = 11;

  IF existing_checksum IS NULL THEN
    INSERT INTO vira.schema_migrations(version, name, checksum)
    VALUES (11, 'prod14_commercial_usage', current_setting('vira.migration_checksum'));
  ELSIF existing_checksum <> current_setting('vira.migration_checksum') THEN
    RAISE EXCEPTION 'migration checksum mismatch for version 11';
  END IF;
END
$vira_migration_record$;

COMMIT;
