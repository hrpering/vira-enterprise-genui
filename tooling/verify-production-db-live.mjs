import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.VIRA_TEST_DATABASE_URL;
const postgresToolsImage = process.env.VIRA_POSTGRES_TOOLS_IMAGE;
if (!databaseUrl) throw new Error("VIRA_TEST_DATABASE_URL is required for the live PostgreSQL gate");
const parsed = new URL(databaseUrl);
if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") throw new Error("VIRA_TEST_DATABASE_URL must use postgres/postgresql");

const scopeA = { organizationId: "acme", projectId: "alpha", environment: "staging" };
const scopeB = { organizationId: "bravo", projectId: "beta", environment: "staging" };
const temp = mkdtempSync(path.join(os.tmpdir(), "vira-prod02-"));
const dump = path.join(temp, "vira.dump");

function psql(sql, { quiet = true } = {}) {
  return execFileSync("psql", [databaseUrl, "-X", quiet ? "-qAt" : "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function lastNonEmptyLine(output) {
  return output.split(/\r?\n/).filter((line) => line.length > 0).at(-1) ?? "";
}

function expectFailure(sql, label) {
  const result = spawnSync("psql", [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
  if (result.status === 0) throw new Error(`${label} unexpectedly succeeded`);
}

function scoped(role, scope, sql) {
  const output = psql(`BEGIN; SET LOCAL ROLE ${role}; SELECT set_config('vira.organization_id', '${scope.organizationId}', true); SELECT set_config('vira.project_id', '${scope.projectId}', true); SELECT set_config('vira.environment', '${scope.environment}', true); SELECT vira.require_scope(); ${sql}; ROLLBACK;`);
  return lastNonEmptyLine(output);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function cleanupFixtures() {
  try {
    psql("DROP TABLE IF EXISTS vira.prod02_child_fixture, vira.prod02_parent_fixture, vira.prod02_worker_fixture CASCADE;");
  } catch {
    // Preserve the original gate failure.
  }
}

function archiveTool(command, args) {
  if (!postgresToolsImage) {
    execFileSync(command, args, { stdio: "inherit" });
    return;
  }
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "host",
      "--volume",
      `${temp}:/vira-proof`,
      postgresToolsImage,
      command,
      ...args,
    ],
    { stdio: "inherit" },
  );
}

function assertApiCannotWriteMigrationEvidence(label) {
  expectFailure("BEGIN; SET LOCAL ROLE vira_api; INSERT INTO vira.schema_migrations(version, name, checksum) VALUES (999999, 'forbidden', repeat('0',64)); COMMIT;", label);
}

try {
  execFileSync("node", [path.join(root, "ops/postgres/apply-migrations.mjs")], {
    cwd: root,
    env: { ...process.env, VIRA_DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  cleanupFixtures();
  psql(`
    BEGIN;
    SET LOCAL ROLE vira_migration;
    CREATE TABLE vira.prod02_parent_fixture (
      organization_id text NOT NULL,
      project_id text NOT NULL,
      environment text NOT NULL,
      record_id text NOT NULL,
      PRIMARY KEY (organization_id, project_id, environment, record_id)
    );
    CREATE TABLE vira.prod02_child_fixture (
      organization_id text NOT NULL,
      project_id text NOT NULL,
      environment text NOT NULL,
      child_id text NOT NULL,
      parent_record_id text NOT NULL,
      PRIMARY KEY (organization_id, project_id, environment, child_id),
      FOREIGN KEY (organization_id, project_id, environment, parent_record_id)
        REFERENCES vira.prod02_parent_fixture (organization_id, project_id, environment, record_id)
    );
    CREATE TABLE vira.prod02_worker_fixture (
      organization_id text NOT NULL,
      project_id text NOT NULL,
      environment text NOT NULL,
      job_id text NOT NULL,
      status text NOT NULL,
      PRIMARY KEY (organization_id, project_id, environment, job_id)
    );
    INSERT INTO vira.prod02_parent_fixture VALUES
      ('acme', 'alpha', 'staging', 'a-parent'),
      ('bravo', 'beta', 'staging', 'b-only');
    INSERT INTO vira.prod02_worker_fixture VALUES
      ('acme', 'alpha', 'staging', 'job-a', 'queued'),
      ('bravo', 'beta', 'staging', 'job-b', 'queued');
    ALTER TABLE vira.prod02_parent_fixture ENABLE ROW LEVEL SECURITY;
    ALTER TABLE vira.prod02_parent_fixture FORCE ROW LEVEL SECURITY;
    ALTER TABLE vira.prod02_child_fixture ENABLE ROW LEVEL SECURITY;
    ALTER TABLE vira.prod02_child_fixture FORCE ROW LEVEL SECURITY;
    ALTER TABLE vira.prod02_worker_fixture ENABLE ROW LEVEL SECURITY;
    ALTER TABLE vira.prod02_worker_fixture FORCE ROW LEVEL SECURITY;
    CREATE POLICY prod02_parent_scope ON vira.prod02_parent_fixture TO vira_api, vira_worker
      USING (vira.scope_matches(organization_id, project_id, environment))
      WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
    CREATE POLICY prod02_child_scope ON vira.prod02_child_fixture TO vira_api, vira_worker
      USING (vira.scope_matches(organization_id, project_id, environment))
      WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
    CREATE POLICY prod02_worker_scope ON vira.prod02_worker_fixture TO vira_worker
      USING (vira.scope_matches(organization_id, project_id, environment))
      WITH CHECK (vira.scope_matches(organization_id, project_id, environment));
    GRANT SELECT, INSERT, UPDATE, DELETE ON vira.prod02_parent_fixture, vira.prod02_child_fixture TO vira_api;
    GRANT SELECT, UPDATE ON vira.prod02_worker_fixture TO vira_worker;
    COMMIT;
  `);

  assertEqual(psql("BEGIN; SET LOCAL ROLE vira_api; SELECT count(*) FROM vira.prod02_parent_fixture; ROLLBACK;"), "0", "missing-scope RLS");
  assertEqual(scoped("vira_api", scopeA, "SELECT string_agg(record_id, ',' ORDER BY record_id) FROM vira.prod02_parent_fixture"), "a-parent", "tenant A read isolation");

  expectFailure(`BEGIN; SET LOCAL ROLE vira_api; SELECT set_config('vira.organization_id', 'acme', true); SELECT set_config('vira.project_id', 'alpha', true); SELECT set_config('vira.environment', 'staging', true); INSERT INTO vira.prod02_parent_fixture VALUES ('bravo','beta','staging','forbidden'); COMMIT;`, "wrong-tenant write");
  expectFailure(`BEGIN; SET LOCAL ROLE vira_api; SELECT set_config('vira.organization_id', 'acme', true); SELECT set_config('vira.project_id', 'alpha', true); SELECT set_config('vira.environment', 'staging', true); INSERT INTO vira.prod02_child_fixture VALUES ('acme','alpha','staging','child-a','b-only'); COMMIT;`, "cross-tenant FK confusion");

  const claimA = scoped("vira_worker", scopeA, "WITH picked AS (SELECT organization_id, project_id, environment, job_id FROM vira.prod02_worker_fixture WHERE status = 'queued' ORDER BY job_id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE vira.prod02_worker_fixture AS jobs SET status = 'claimed' FROM picked WHERE jobs.organization_id = picked.organization_id AND jobs.project_id = picked.project_id AND jobs.environment = picked.environment AND jobs.job_id = picked.job_id RETURNING jobs.organization_id || '|' || jobs.project_id || '|' || jobs.environment || '|' || jobs.job_id");
  assertEqual(claimA, "acme|alpha|staging|job-a", "tenant A worker claim");
  const claimB = scoped("vira_worker", scopeB, "SELECT organization_id || '|' || project_id || '|' || environment || '|' || job_id FROM vira.prod02_worker_fixture WHERE status = 'queued' ORDER BY job_id FOR UPDATE SKIP LOCKED LIMIT 1");
  assertEqual(claimB, "bravo|beta|staging|job-b", "tenant B worker claim");

  const leak = lastNonEmptyLine(psql("BEGIN; SELECT set_config('vira.organization_id', 'acme', true); SELECT set_config('vira.project_id', 'alpha', true); SELECT set_config('vira.environment', 'staging', true); COMMIT; SELECT coalesce(nullif(current_setting('vira.organization_id', true), ''), '<null>') || '|' || coalesce(nullif(current_setting('vira.project_id', true), ''), '<null>') || '|' || coalesce(nullif(current_setting('vira.environment', true), ''), '<null>');"));
  assertEqual(leak, "<null>|<null>|<null>", "transaction-local pool scope cleanup");
  assertApiCannotWriteMigrationEvidence("API migration authority");

  if (postgresToolsImage) {
    archiveTool("pg_dump", [`--dbname=${databaseUrl}`, "--format=custom", "--schema=vira", "--no-owner", "--file=/vira-proof/vira.dump"]);
  } else {
    archiveTool("pg_dump", [`--dbname=${databaseUrl}`, "--format=custom", "--schema=vira", "--no-owner", `--file=${dump}`]);
  }
  psql("DROP SCHEMA vira CASCADE;");
  if (postgresToolsImage) {
    archiveTool("pg_restore", [`--dbname=${databaseUrl}`, "--role=vira_migration", "--no-owner", "/vira-proof/vira.dump"]);
  } else {
    archiveTool("pg_restore", [`--dbname=${databaseUrl}`, "--role=vira_migration", "--no-owner", dump]);
  }

  assertEqual(psql("SELECT count(*) FROM vira.schema_migrations WHERE version = 1"), "1", "restore migration evidence");
  assertEqual(psql("SELECT count(*) FROM vira.prod02_worker_fixture"), "2", "restore fixture data");
  assertEqual(scoped("vira_api", scopeA, "SELECT string_agg(record_id, ',' ORDER BY record_id) FROM vira.prod02_parent_fixture"), "a-parent", "restored tenant A RLS");
  assertEqual(scoped("vira_worker", scopeB, "SELECT organization_id || '|' || project_id || '|' || environment || '|' || job_id FROM vira.prod02_worker_fixture WHERE status = 'queued' ORDER BY job_id FOR UPDATE SKIP LOCKED LIMIT 1"), "bravo|beta|staging|job-b", "restored worker claim isolation");
  assertApiCannotWriteMigrationEvidence("restored API migration authority");

  execFileSync("node", [path.join(root, "ops/postgres/apply-migrations.mjs")], {
    cwd: root,
    env: { ...process.env, VIRA_DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
  process.stdout.write("Production PostgreSQL live tenant-isolation and restore verification passed.\n");
} finally {
  cleanupFixtures();
  rmSync(temp, { recursive: true, force: true });
}
