\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('vira:schema-migrations', 0));
SET LOCAL ROLE vira_migration;

ALTER TABLE vira.durable_execution_outbox
  DROP CONSTRAINT IF EXISTS durable_execution_outbox_event_type_match;
ALTER TABLE vira.durable_execution_outbox
  ADD CONSTRAINT durable_execution_outbox_event_type_match
  CHECK ((event ->> 'type' = event_type) IS TRUE);

SELECT set_config('vira.migration_checksum', :'migration_checksum', true);
DO $vira_migration_record$
DECLARE
  existing_checksum text;
BEGIN
  SELECT checksum INTO existing_checksum
  FROM vira.schema_migrations
  WHERE version = 7;

  IF existing_checksum IS NULL THEN
    INSERT INTO vira.schema_migrations(version, name, checksum)
    VALUES (7, 'prod12_outbox_contract', current_setting('vira.migration_checksum'));
  ELSIF existing_checksum <> current_setting('vira.migration_checksum') THEN
    RAISE EXCEPTION 'migration checksum mismatch for version 7';
  END IF;
END
$vira_migration_record$;

COMMIT;
