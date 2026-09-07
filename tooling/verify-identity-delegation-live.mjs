import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.VIRA_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("VIRA_TEST_DATABASE_URL is required for the identity live gate");

const scopeA = { organizationId: "acme", projectId: "alpha", environment: "staging" };
const scopeB = { organizationId: "bravo", projectId: "beta", environment: "staging" };

function psql(sql) {
  return execFileSync(
    "psql",
    [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function lastNonEmptyLine(output) {
  return output.split(/\r?\n/).filter((line) => line.length > 0).at(-1) ?? "";
}

function expectFailure(sql, label) {
  const result = spawnSync(
    "psql",
    [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  );
  if (result.status === 0) throw new Error(`${label} unexpectedly succeeded`);
}

function scoped(role, scope, sql, { commit = false } = {}) {
  const transactionEnd = commit ? "COMMIT" : "ROLLBACK";
  return lastNonEmptyLine(psql(
    `BEGIN; SET LOCAL ROLE ${role}; `
    + `SELECT set_config('vira.organization_id', '${scope.organizationId}', true); `
    + `SELECT set_config('vira.project_id', '${scope.projectId}', true); `
    + `SELECT set_config('vira.environment', '${scope.environment}', true); `
    + `SELECT vira.require_scope(); ${sql}; ${transactionEnd};`,
  ));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function cleanup() {
  try {
    psql("DELETE FROM vira.browser_session; DELETE FROM vira.delegation_grant; DELETE FROM vira.identity_membership;");
  } catch {
    // Preserve the original gate failure.
  }
}

try {
  execFileSync("node", [path.join(root, "ops/postgres/apply-migrations.mjs")], {
    cwd: root,
    env: { ...process.env, VIRA_DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  cleanup();
  assertEqual(psql("SELECT count(*) FROM vira.schema_migrations WHERE version = 2"), "1", "PROD-03 migration evidence");
  assertEqual(
    psql("SELECT count(*) FROM pg_class WHERE relnamespace = 'vira'::regnamespace AND relname IN ('identity_membership','delegation_grant','browser_session') AND relrowsecurity AND relforcerowsecurity"),
    "3",
    "PROD-03 RLS force coverage",
  );
  assertEqual(
    psql("SELECT count(*) FROM information_schema.columns WHERE table_schema = 'vira' AND table_name IN ('identity_membership','delegation_grant','browser_session') AND column_name IN ('access_token','refresh_token','id_token','session_token')"),
    "0",
    "raw token persistence",
  );

  scoped("vira_identity", scopeA, `
    INSERT INTO vira.identity_membership (
      organization_id, project_id, environment, membership_id,
      identity_issuer, identity_subject, principal_kind, principal_id,
      revision, active
    ) VALUES (
      'acme','alpha','staging','membership-a',
      'https://issuer.example','alice','user','user:alice',
      7,true
    )
  `, { commit: true });
  scoped("vira_identity", scopeB, `
    INSERT INTO vira.identity_membership (
      organization_id, project_id, environment, membership_id,
      identity_issuer, identity_subject, principal_kind, principal_id,
      revision, active
    ) VALUES (
      'bravo','beta','staging','membership-b',
      'https://issuer.example','bob','user','user:bob',
      3,true
    )
  `, { commit: true });

  assertEqual(psql("BEGIN; SET LOCAL ROLE vira_api; SELECT count(*) FROM vira.identity_membership; ROLLBACK;"), "0", "missing-scope identity RLS");
  assertEqual(scoped("vira_api", scopeA, "SELECT membership_id FROM vira.identity_membership"), "membership-a", "tenant A membership visibility");
  expectFailure(
    "BEGIN; SET LOCAL ROLE vira_api; "
      + "SELECT set_config('vira.organization_id','acme',true); "
      + "SELECT set_config('vira.project_id','alpha',true); "
      + "SELECT set_config('vira.environment','staging',true); "
      + "UPDATE vira.identity_membership SET active=false WHERE membership_id='membership-a'; COMMIT;",
    "API membership mutation",
  );
  expectFailure(
    "BEGIN; SET LOCAL ROLE vira_worker; "
      + "SELECT set_config('vira.organization_id','acme',true); "
      + "SELECT set_config('vira.project_id','alpha',true); "
      + "SELECT set_config('vira.environment','staging',true); "
      + "SELECT count(*) FROM vira.identity_membership; ROLLBACK;",
    "worker identity read",
  );

  scoped("vira_identity", scopeB, `
    INSERT INTO vira.delegation_grant (
      organization_id, project_id, environment, grant_id,
      delegator_kind, delegator_id, delegate_kind, delegate_id,
      audience, issued_at, expires_at
    ) VALUES (
      'bravo','beta','staging','shared-parent',
      'user','user:bob','agent','agent:b',
      'vira:execute', now() - interval '1 minute', now() + interval '10 minutes'
    )
  `, { commit: true });

  expectFailure(
    "BEGIN; SET LOCAL ROLE vira_identity; "
      + "SELECT set_config('vira.organization_id','acme',true); "
      + "SELECT set_config('vira.project_id','alpha',true); "
      + "SELECT set_config('vira.environment','staging',true); "
      + "INSERT INTO vira.delegation_grant ("
      + "organization_id,project_id,environment,grant_id,parent_grant_id,"
      + "delegator_kind,delegator_id,delegate_kind,delegate_id,audience,issued_at,expires_at"
      + ") VALUES ("
      + "'acme','alpha','staging','child-a','shared-parent',"
      + "'user','user:alice','agent','agent:a','vira:execute',now()-interval '1 minute',now()+interval '10 minutes'"
      + "); COMMIT;",
    "cross-scope delegation parent",
  );

  scoped("vira_identity", scopeA, `
    INSERT INTO vira.delegation_grant (
      organization_id, project_id, environment, grant_id,
      delegator_kind, delegator_id, delegate_kind, delegate_id,
      audience, issued_at, expires_at
    ) VALUES (
      'acme','alpha','staging','grant-a',
      'user','user:alice','agent','agent:planner',
      'vira:execute', now() - interval '1 minute', now() + interval '10 minutes'
    )
  `, { commit: true });
  assertEqual(
    scoped("vira_identity", scopeA, "UPDATE vira.delegation_grant SET revoked_at=now() WHERE grant_id='grant-a' RETURNING grant_id", { commit: true }),
    "grant-a",
    "delegation revocation persistence",
  );

  scoped("vira_identity", scopeA, `
    INSERT INTO vira.browser_session (
      organization_id, project_id, environment, session_id_hash,
      membership_id, membership_revision, principal_kind, principal_id,
      issued_at, expires_at
    ) VALUES (
      'acme','alpha','staging',repeat('a',64),
      'membership-a',7,'user','user:alice',
      now(),now()+interval '1 hour'
    )
  `, { commit: true });
  assertEqual(scoped("vira_api", scopeA, "SELECT session_id_hash FROM vira.browser_session"), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "tenant A session lookup");

  expectFailure(
    "BEGIN; SET LOCAL ROLE vira_identity; "
      + "SELECT set_config('vira.organization_id','acme',true); "
      + "SELECT set_config('vira.project_id','alpha',true); "
      + "SELECT set_config('vira.environment','staging',true); "
      + "INSERT INTO vira.browser_session ("
      + "organization_id,project_id,environment,session_id_hash,membership_id,membership_revision,"
      + "principal_kind,principal_id,issued_at,expires_at"
      + ") VALUES ("
      + "'bravo','beta','staging',repeat('b',64),'membership-b',3,'user','user:bob',now(),now()+interval '1 hour'"
      + "); COMMIT;",
    "wrong-tenant browser session write",
  );

  process.stdout.write("IDENTITY_DELEGATION_LIVE_OK\n");
} finally {
  cleanup();
}
