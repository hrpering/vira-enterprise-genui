\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('vira:schema-migrations', 0));
SET LOCAL ROLE vira_migration;

CREATE SCHEMA IF NOT EXISTS vira AUTHORIZATION vira_migration;
ALTER SCHEMA vira OWNER TO vira_migration;
REVOKE CREATE ON SCHEMA vira FROM PUBLIC;

CREATE TABLE IF NOT EXISTS vira.schema_migrations (
  version bigint PRIMARY KEY,
  name text NOT NULL UNIQUE,
  checksum char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT vira_schema_migrations_checksum CHECK (checksum ~ '^[0-9a-f]{64}$')
);
ALTER TABLE vira.schema_migrations OWNER TO vira_migration;

CREATE OR REPLACE FUNCTION vira.current_organization_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$ SELECT NULLIF(current_setting('vira.organization_id', true), '') $$;

CREATE OR REPLACE FUNCTION vira.current_project_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$ SELECT NULLIF(current_setting('vira.project_id', true), '') $$;

CREATE OR REPLACE FUNCTION vira.current_environment()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$ SELECT NULLIF(current_setting('vira.environment', true), '') $$;

CREATE OR REPLACE FUNCTION vira.require_scope()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $vira_scope$
BEGIN
  IF vira.current_organization_id() IS NULL
     OR vira.current_project_id() IS NULL
     OR vira.current_environment() IS NULL THEN
    RAISE EXCEPTION 'Vira enterprise database scope is not set'
      USING ERRCODE = '42501';
  END IF;
END
$vira_scope$;

CREATE OR REPLACE FUNCTION vira.scope_matches(
  row_organization_id text,
  row_project_id text,
  row_environment text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT row_organization_id = vira.current_organization_id()
     AND row_project_id = vira.current_project_id()
     AND row_environment = vira.current_environment()
$$;

REVOKE ALL ON FUNCTION vira.current_organization_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION vira.current_project_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION vira.current_environment() FROM PUBLIC;
REVOKE ALL ON FUNCTION vira.require_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION vira.scope_matches(text, text, text) FROM PUBLIC;

GRANT USAGE ON SCHEMA vira TO vira_api, vira_worker, vira_ops;
GRANT EXECUTE ON FUNCTION vira.current_organization_id() TO vira_api, vira_worker, vira_ops;
GRANT EXECUTE ON FUNCTION vira.current_project_id() TO vira_api, vira_worker, vira_ops;
GRANT EXECUTE ON FUNCTION vira.current_environment() TO vira_api, vira_worker, vira_ops;
GRANT EXECUTE ON FUNCTION vira.require_scope() TO vira_api, vira_worker, vira_ops;
GRANT EXECUTE ON FUNCTION vira.scope_matches(text, text, text) TO vira_api, vira_worker, vira_ops;

REVOKE ALL ON TABLE vira.schema_migrations FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT SELECT ON TABLE vira.schema_migrations TO vira_ops;

SELECT set_config('vira.migration_checksum', :'migration_checksum', true);
DO $vira_migration_record$
DECLARE
  existing_checksum text;
BEGIN
  SELECT checksum INTO existing_checksum
  FROM vira.schema_migrations
  WHERE version = 1;

  IF existing_checksum IS NULL THEN
    INSERT INTO vira.schema_migrations(version, name, checksum)
    VALUES (1, 'prod02_foundation', current_setting('vira.migration_checksum'));
  ELSIF existing_checksum <> current_setting('vira.migration_checksum') THEN
    RAISE EXCEPTION 'migration checksum mismatch for version 1';
  END IF;
END
$vira_migration_record$;

COMMIT;
