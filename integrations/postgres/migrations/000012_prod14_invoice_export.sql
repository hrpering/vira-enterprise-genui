\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('vira:schema-migrations', 0));
SET LOCAL ROLE vira_migration;

CREATE TABLE IF NOT EXISTS vira.commercial_invoice_export (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  export_id text NOT NULL,
  revision bigint NOT NULL,
  customer_kind text NOT NULL,
  customer_id text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  currency text NOT NULL,
  plan_id text NOT NULL,
  plan_version text NOT NULL,
  source_set_digest text NOT NULL,
  content_digest text NOT NULL,
  total_amount_nanos bigint NOT NULL,
  created_at timestamptz NOT NULL,
  invoice_export jsonb NOT NULL,
  persisted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, export_id, revision),
  CONSTRAINT commercial_invoice_export_environment CHECK (environment IN ('dev', 'staging', 'production')),
  CONSTRAINT commercial_invoice_export_revision CHECK (revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT commercial_invoice_export_period CHECK (period_start < period_end),
  CONSTRAINT commercial_invoice_export_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT commercial_invoice_export_source_digest CHECK (source_set_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT commercial_invoice_export_content_digest CHECK (content_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT commercial_invoice_export_total CHECK (total_amount_nanos BETWEEN 0 AND 9007199254740991),
  CONSTRAINT commercial_invoice_export_nonempty CHECK (
    length(export_id) BETWEEN 1 AND 512
    AND length(customer_kind) BETWEEN 1 AND 64
    AND length(customer_id) BETWEEN 1 AND 512
    AND length(plan_id) BETWEEN 1 AND 255
    AND length(plan_version) BETWEEN 1 AND 128
  ),
  CONSTRAINT commercial_invoice_export_json_object CHECK ((jsonb_typeof(invoice_export) = 'object') IS TRUE),
  CONSTRAINT commercial_invoice_export_json_version CHECK ((invoice_export ->> 'version' = '1') IS TRUE),
  CONSTRAINT commercial_invoice_export_json_id CHECK ((invoice_export ->> 'exportId' = export_id) IS TRUE),
  CONSTRAINT commercial_invoice_export_json_revision CHECK (((invoice_export -> 'revision') = to_jsonb(revision)) IS TRUE),
  CONSTRAINT commercial_invoice_export_scope_organization CHECK ((invoice_export -> 'scope' ->> 'organizationId' = organization_id) IS TRUE),
  CONSTRAINT commercial_invoice_export_scope_project CHECK ((invoice_export -> 'scope' ->> 'projectId' = project_id) IS TRUE),
  CONSTRAINT commercial_invoice_export_scope_environment CHECK ((invoice_export -> 'scope' ->> 'environment' = environment) IS TRUE),
  CONSTRAINT commercial_invoice_export_customer_kind CHECK ((invoice_export -> 'customer' ->> 'kind' = customer_kind) IS TRUE),
  CONSTRAINT commercial_invoice_export_customer_id CHECK ((invoice_export -> 'customer' ->> 'id' = customer_id) IS TRUE),
  CONSTRAINT commercial_invoice_export_currency_json CHECK ((invoice_export ->> 'currency' = currency) IS TRUE),
  CONSTRAINT commercial_invoice_export_plan_id CHECK ((invoice_export -> 'planRef' ->> 'id' = plan_id) IS TRUE),
  CONSTRAINT commercial_invoice_export_plan_version CHECK ((invoice_export -> 'planRef' ->> 'versionRef' = plan_version) IS TRUE),
  CONSTRAINT commercial_invoice_export_source_digest_json CHECK ((invoice_export ->> 'sourceSetDigest' = source_set_digest) IS TRUE),
  CONSTRAINT commercial_invoice_export_content_digest_json CHECK ((invoice_export ->> 'contentDigest' = content_digest) IS TRUE),
  CONSTRAINT commercial_invoice_export_total_json CHECK (((invoice_export -> 'totalAmountNanos') = to_jsonb(total_amount_nanos)) IS TRUE)
);
ALTER TABLE vira.commercial_invoice_export OWNER TO vira_migration;

CREATE INDEX IF NOT EXISTS commercial_invoice_export_customer_period_idx
  ON vira.commercial_invoice_export (
    organization_id, project_id, environment,
    customer_kind, customer_id, period_start DESC, period_end DESC,
    export_id, revision DESC
  );

ALTER TABLE vira.commercial_invoice_export ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.commercial_invoice_export FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_invoice_export_worker_read_scope ON vira.commercial_invoice_export;
CREATE POLICY commercial_invoice_export_worker_read_scope ON vira.commercial_invoice_export
  FOR SELECT TO vira_worker
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS commercial_invoice_export_worker_insert_scope ON vira.commercial_invoice_export;
CREATE POLICY commercial_invoice_export_worker_insert_scope ON vira.commercial_invoice_export
  FOR INSERT TO vira_worker
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS commercial_invoice_export_ops_scope ON vira.commercial_invoice_export;
CREATE POLICY commercial_invoice_export_ops_scope ON vira.commercial_invoice_export
  FOR SELECT TO vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment));
DROP POLICY IF EXISTS commercial_invoice_export_api_scope ON vira.commercial_invoice_export;
CREATE POLICY commercial_invoice_export_api_scope ON vira.commercial_invoice_export
  FOR SELECT TO vira_api
  USING (vira.scope_matches(organization_id, project_id, environment));

REVOKE ALL ON TABLE vira.commercial_invoice_export FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT, INSERT ON TABLE vira.commercial_invoice_export TO vira_worker;
GRANT SELECT ON TABLE vira.commercial_invoice_export TO vira_api, vira_ops;

SELECT set_config('vira.migration_checksum', :'migration_checksum', true);
DO $vira_migration_record$
DECLARE
  existing_checksum text;
BEGIN
  SELECT checksum INTO existing_checksum FROM vira.schema_migrations WHERE version = 12;
  IF existing_checksum IS NULL THEN
    INSERT INTO vira.schema_migrations(version, name, checksum)
    VALUES (12, 'prod14_invoice_export', current_setting('vira.migration_checksum'));
  ELSIF existing_checksum <> current_setting('vira.migration_checksum') THEN
    RAISE EXCEPTION 'migration checksum mismatch for version 12';
  END IF;
END
$vira_migration_record$;

COMMIT;
