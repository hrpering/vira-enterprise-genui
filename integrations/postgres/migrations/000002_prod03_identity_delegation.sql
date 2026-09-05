\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('vira:schema-migrations', 0));
SET LOCAL ROLE vira_migration;

CREATE TABLE IF NOT EXISTS vira.identity_membership (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  membership_id text NOT NULL,
  identity_issuer text NOT NULL,
  identity_subject text NOT NULL,
  principal_kind text NOT NULL,
  principal_id text NOT NULL,
  revision bigint NOT NULL,
  active boolean NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, project_id, environment, membership_id),
  UNIQUE (organization_id, project_id, environment, identity_issuer, identity_subject),
  CONSTRAINT identity_membership_principal_kind CHECK (principal_kind IN ('user', 'agent', 'service')),
  CONSTRAINT identity_membership_revision CHECK (revision > 0)
);
ALTER TABLE vira.identity_membership OWNER TO vira_migration;

CREATE TABLE IF NOT EXISTS vira.delegation_grant (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  grant_id text NOT NULL,
  parent_grant_id text,
  delegator_kind text NOT NULL,
  delegator_id text NOT NULL,
  delegate_kind text NOT NULL,
  delegate_id text NOT NULL,
  audience text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (organization_id, project_id, environment, grant_id),
  FOREIGN KEY (organization_id, project_id, environment, parent_grant_id)
    REFERENCES vira.delegation_grant (organization_id, project_id, environment, grant_id),
  CONSTRAINT delegation_grant_delegator_kind CHECK (delegator_kind IN ('user', 'agent', 'service')),
  CONSTRAINT delegation_grant_delegate_kind CHECK (delegate_kind IN ('user', 'agent', 'service')),
  CONSTRAINT delegation_grant_distinct_principals CHECK (
    delegator_kind <> delegate_kind OR delegator_id <> delegate_id
  ),
  CONSTRAINT delegation_grant_time_order CHECK (expires_at > issued_at),
  CONSTRAINT delegation_grant_audience_nonempty CHECK (length(audience) BETWEEN 1 AND 256)
);
ALTER TABLE vira.delegation_grant OWNER TO vira_migration;

CREATE TABLE IF NOT EXISTS vira.browser_session (
  organization_id text NOT NULL,
  project_id text NOT NULL,
  environment text NOT NULL,
  session_id_hash char(64) NOT NULL,
  membership_id text NOT NULL,
  membership_revision bigint NOT NULL,
  principal_kind text NOT NULL,
  principal_id text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (organization_id, project_id, environment, session_id_hash),
  UNIQUE (session_id_hash),
  FOREIGN KEY (organization_id, project_id, environment, membership_id)
    REFERENCES vira.identity_membership (organization_id, project_id, environment, membership_id),
  CONSTRAINT browser_session_hash CHECK (session_id_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT browser_session_membership_revision CHECK (membership_revision > 0),
  CONSTRAINT browser_session_principal_kind CHECK (principal_kind IN ('user', 'agent', 'service')),
  CONSTRAINT browser_session_time_order CHECK (expires_at > issued_at)
);
ALTER TABLE vira.browser_session OWNER TO vira_migration;

CREATE INDEX IF NOT EXISTS identity_membership_principal_idx
  ON vira.identity_membership (organization_id, project_id, environment, principal_kind, principal_id);
CREATE INDEX IF NOT EXISTS delegation_grant_delegate_idx
  ON vira.delegation_grant (organization_id, project_id, environment, delegate_kind, delegate_id);
CREATE INDEX IF NOT EXISTS browser_session_expiry_idx
  ON vira.browser_session (organization_id, project_id, environment, expires_at);

ALTER TABLE vira.identity_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.identity_membership FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.delegation_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.delegation_grant FORCE ROW LEVEL SECURITY;
ALTER TABLE vira.browser_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE vira.browser_session FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identity_membership_scope ON vira.identity_membership;
CREATE POLICY identity_membership_scope ON vira.identity_membership
  TO vira_api, vira_identity, vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS delegation_grant_scope ON vira.delegation_grant;
CREATE POLICY delegation_grant_scope ON vira.delegation_grant
  TO vira_api, vira_identity, vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));

DROP POLICY IF EXISTS browser_session_scope ON vira.browser_session;
CREATE POLICY browser_session_scope ON vira.browser_session
  TO vira_api, vira_identity, vira_ops
  USING (vira.scope_matches(organization_id, project_id, environment))
  WITH CHECK (vira.scope_matches(organization_id, project_id, environment));

GRANT USAGE ON SCHEMA vira TO vira_identity;
GRANT EXECUTE ON FUNCTION vira.current_organization_id() TO vira_identity;
GRANT EXECUTE ON FUNCTION vira.current_project_id() TO vira_identity;
GRANT EXECUTE ON FUNCTION vira.current_environment() TO vira_identity;
GRANT EXECUTE ON FUNCTION vira.require_scope() TO vira_identity;
GRANT EXECUTE ON FUNCTION vira.scope_matches(text, text, text) TO vira_identity;

REVOKE ALL ON TABLE vira.identity_membership, vira.delegation_grant, vira.browser_session
  FROM PUBLIC, vira_api, vira_worker, vira_identity, vira_ops;
GRANT SELECT ON TABLE vira.identity_membership, vira.delegation_grant, vira.browser_session TO vira_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE vira.identity_membership, vira.delegation_grant, vira.browser_session TO vira_identity;
GRANT SELECT ON TABLE vira.identity_membership, vira.delegation_grant, vira.browser_session TO vira_ops;

SELECT set_config('vira.migration_checksum', :'migration_checksum', true);
DO $vira_migration_record$
DECLARE
  existing_checksum text;
BEGIN
  SELECT checksum INTO existing_checksum
  FROM vira.schema_migrations
  WHERE version = 2;

  IF existing_checksum IS NULL THEN
    INSERT INTO vira.schema_migrations(version, name, checksum)
    VALUES (2, 'prod03_identity_delegation', current_setting('vira.migration_checksum'));
  ELSIF existing_checksum <> current_setting('vira.migration_checksum') THEN
    RAISE EXCEPTION 'migration checksum mismatch for version 2';
  END IF;
END
$vira_migration_record$;

COMMIT;
