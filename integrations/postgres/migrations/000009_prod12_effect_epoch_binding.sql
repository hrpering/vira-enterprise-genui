\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('vira:schema-migrations', 0));
SET LOCAL ROLE vira_migration;

ALTER TABLE vira.durable_execution_effect_reservation
  ADD COLUMN IF NOT EXISTS bound_lease_epoch bigint;

-- The table is FORCE RLS and vira_migration is intentionally NOBYPASSRLS.
-- Temporarily remove FORCE for this owner-only migration transaction so an
-- existing reservation can be backfilled without creating a broad runtime
-- migration policy. The transaction restores FORCE before commit; any error
-- rolls the whole change back.
ALTER TABLE vira.durable_execution_effect_reservation NO FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_state NO FORCE ROW LEVEL SECURITY;

UPDATE vira.durable_execution_effect_reservation AS reservation
   SET bound_lease_epoch = state.lease_epoch
  FROM vira.durable_execution_state AS state
 WHERE reservation.bound_lease_epoch IS NULL
   AND state.organization_id = reservation.organization_id
   AND state.project_id = reservation.project_id
   AND state.environment = reservation.environment
   AND state.execution_id = reservation.execution_id;

DO $vira_effect_epoch_backfill$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM vira.durable_execution_effect_reservation
     WHERE bound_lease_epoch IS NULL
  ) THEN
    RAISE EXCEPTION 'cannot backfill durable effect reservation lease epoch';
  END IF;
END
$vira_effect_epoch_backfill$;

ALTER TABLE vira.durable_execution_effect_reservation FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.durable_execution_state FORCE ROW LEVEL SECURITY;

ALTER TABLE vira.durable_execution_effect_reservation
  ALTER COLUMN bound_lease_epoch SET NOT NULL;
ALTER TABLE vira.durable_execution_effect_reservation
  DROP CONSTRAINT IF EXISTS durable_execution_effect_bound_lease_epoch;
ALTER TABLE vira.durable_execution_effect_reservation
  ADD CONSTRAINT durable_execution_effect_bound_lease_epoch
  CHECK (bound_lease_epoch BETWEEN 1 AND 9007199254740991);

REVOKE UPDATE ON TABLE vira.durable_execution_effect_reservation FROM PUBLIC, vira_api, vira_worker, vira_ops;
GRANT UPDATE (bound_lease_epoch) ON TABLE vira.durable_execution_effect_reservation TO vira_worker;

SELECT set_config('vira.migration_checksum', :'migration_checksum', true);
DO $vira_migration_record$
DECLARE
  existing_checksum text;
BEGIN
  SELECT checksum INTO existing_checksum
  FROM vira.schema_migrations
  WHERE version = 9;

  IF existing_checksum IS NULL THEN
    INSERT INTO vira.schema_migrations(version, name, checksum)
    VALUES (9, 'prod12_effect_epoch_binding', current_setting('vira.migration_checksum'));
  ELSIF existing_checksum <> current_setting('vira.migration_checksum') THEN
    RAISE EXCEPTION 'migration checksum mismatch for version 9';
  END IF;
END
$vira_migration_record$;

COMMIT;
