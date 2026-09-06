import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.VIRA_TEST_DATABASE_URL;
const postgresToolsImage = process.env.VIRA_POSTGRES_TOOLS_IMAGE;
if (!databaseUrl) throw new Error("VIRA_TEST_DATABASE_URL is required for the PROD-08 runtime durability DB gate");
const parsed = new URL(databaseUrl);
if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") throw new Error("VIRA_TEST_DATABASE_URL must use postgres/postgresql");

const temp = mkdtempSync(path.join(os.tmpdir(), "vira-prod08-runtime-"));
const dump = path.join(temp, "vira-prod08-runtime.dump");
const scopeA = { organizationId: "acme", projectId: "alpha", environment: "staging" };
const scopeB = { organizationId: "bravo", projectId: "beta", environment: "staging" };
const resolutionDigest = "b".repeat(64);

function psql(sql) {
  return execFileSync("psql", [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function lastLine(output) {
  return output.split(/\r?\n/).filter(Boolean).at(-1) ?? "";
}

function scoped(role, scope, sql) {
  return lastLine(psql(`BEGIN; SET LOCAL ROLE ${role}; SELECT set_config('vira.organization_id','${scope.organizationId}',true); SELECT set_config('vira.project_id','${scope.projectId}',true); SELECT set_config('vira.environment','${scope.environment}',true); SELECT vira.require_scope(); ${sql}; COMMIT;`));
}

function expectFailure(sql, label) {
  const result = spawnSync("psql", [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
  if (result.status === 0) throw new Error(`${label} unexpectedly succeeded`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function archiveTool(command, args) {
  if (!postgresToolsImage) {
    execFileSync(command, args, { stdio: "inherit" });
    return;
  }
  execFileSync("docker", ["run", "--rm", "--network", "host", "--volume", `${temp}:/vira-proof`, postgresToolsImage, command, ...args], { stdio: "inherit" });
}

function q(value) {
  return value.replaceAll("'", "''");
}

function cleanupFixtures() {
  try {
    psql(`
      DELETE FROM vira.trigger_inbox_state
       WHERE source_ref = 'provider.github.webhook' AND event_id = 'event.prod08.001';
      DELETE FROM vira.human_task_state
       WHERE task_id IN ('task.prod08.001', 'task.mismatch');
      DELETE FROM vira.application_run_state
       WHERE run_id IN ('run.prod08.001', 'run.api-forbidden', 'run.cross', 'run.overflow');
    `);
  } catch {
    // Preserve the original gate failure when schema/state is unavailable.
  }
}

const runRecordObject = {
  version: "1",
  id: "run.prod08.001",
  scope: { version: "1", organizationId: "acme", projectId: "alpha", environment: "staging" },
  revision: 1,
  status: "running",
  resolution: {
    release: { id: "acme.application", version: "1.0.0" },
    environment: "staging",
    deploymentId: "deployment:acme:1",
    deploymentRevision: 1,
    artifactId: "artifact:application:1",
    distributionDigest: "a".repeat(64),
    resolutionDigest,
  },
  entrypointRef: { id: "acme.flow.main", versionRef: "1.0.0" },
  workContextId: null,
  wait: null,
  createdAtUnixMs: 1_900_000_000_000,
  updatedAtUnixMs: 1_900_000_000_000,
};
const runRecord = JSON.stringify(runRecordObject);
const apiForbiddenRecord = JSON.stringify({ ...runRecordObject, id: "run.api-forbidden" });
const crossScopeRecord = JSON.stringify({
  ...runRecordObject,
  id: "run.cross",
  scope: { version: "1", organizationId: "bravo", projectId: "beta", environment: "staging" },
});

const taskRecordObject = {
  version: "1",
  id: "task.prod08.001",
  scope: { version: "1", organizationId: "acme", projectId: "alpha", environment: "staging" },
  revision: 1,
  runId: "run.prod08.001",
  runRevision: 1,
  waitId: "wait.prod08.001",
  status: "assigned",
  assignee: { version: "1", kind: "user", id: "user:alice", organizationId: "acme" },
  claimant: null,
  resultRef: null,
  evidenceRef: null,
  escalationCount: 0,
  escalateAtUnixMs: null,
  expiresAtUnixMs: null,
  lastEscalatedAtUnixMs: null,
  createdAtUnixMs: 1_900_000_000_000,
  updatedAtUnixMs: 1_900_000_000_000,
  closedAtUnixMs: null,
};
const taskRecord = JSON.stringify(taskRecordObject);
const mismatchTaskRecord = JSON.stringify({ ...taskRecordObject, id: "task.mismatch" });

const triggerRecord = JSON.stringify({
  version: "1",
  sourceRef: "provider.github.webhook",
  eventId: "event.prod08.001",
  scope: { version: "1", organizationId: "acme", projectId: "alpha", environment: "staging" },
  revision: 1,
  status: "pending",
  triggerType: "webhook",
  entrypointRef: { id: "acme.flow.main", versionRef: "1.0.0" },
  resolution: {
    release: { id: "acme.application", version: "1.0.0" },
    environment: "staging",
    deploymentId: "deployment:acme:1",
    deploymentRevision: 1,
    artifactId: "artifact:application:1",
    distributionDigest: "a".repeat(64),
    resolutionDigest,
  },
  resolutionArtifactRef: { id: "artifact.resolution.001", revision: 1, digest: `sha256:${resolutionDigest}` },
  payloadArtifactRef: { id: "artifact.event.001", revision: 1, digest: `sha256:${"c".repeat(64)}` },
  occurredAtUnixMs: 1_900_000_000_000,
  receivedAtUnixMs: 1_900_000_000_000,
  replayExpiresAtUnixMs: 1_900_003_600_000,
  processingRef: null,
  leaseUntilUnixMs: null,
  processedRunId: null,
  updatedAtUnixMs: 1_900_000_000_000,
});

try {
  execFileSync("node", [path.join(root, "ops/postgres/apply-migrations.mjs")], {
    cwd: root,
    env: { ...process.env, VIRA_DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  cleanupFixtures();

  assertEqual(psql("SELECT count(*) FROM vira.schema_migrations WHERE version = 4 AND name = 'prod08_runtime_durability'"), "1", "PROD-08 migration evidence");
  assertEqual(psql("SELECT has_table_privilege('vira_api','vira.application_run_state','INSERT')"), "f", "API runtime INSERT privilege");
  assertEqual(psql("SELECT has_column_privilege('vira_api','vira.application_run_state','revision','UPDATE')"), "f", "API runtime UPDATE privilege");
  assertEqual(psql("SELECT has_table_privilege('vira_worker','vira.application_run_state','INSERT')"), "t", "worker runtime INSERT privilege");
  assertEqual(psql("SELECT has_column_privilege('vira_worker','vira.application_run_state','revision','UPDATE')"), "t", "worker runtime CAS UPDATE privilege");
  assertEqual(psql("SELECT has_table_privilege('vira_worker','vira.application_run_state','DELETE')"), "f", "worker runtime DELETE privilege");
  assertEqual(psql("BEGIN; SET LOCAL ROLE vira_api; SELECT count(*) FROM vira.application_run_state; ROLLBACK;"), "0", "missing-scope runtime RLS");

  scoped("vira_worker", scopeA, `
    INSERT INTO vira.application_run_state (organization_id,project_id,environment,run_id,revision,status,record)
    VALUES ('acme','alpha','staging','run.prod08.001',1,'running','${q(runRecord)}'::jsonb);
    INSERT INTO vira.human_task_state (organization_id,project_id,environment,task_id,revision,status,record)
    VALUES ('acme','alpha','staging','task.prod08.001',1,'assigned','${q(taskRecord)}'::jsonb);
    INSERT INTO vira.trigger_inbox_state (organization_id,project_id,environment,source_ref,event_id,revision,status,record)
    VALUES ('acme','alpha','staging','provider.github.webhook','event.prod08.001',1,'pending','${q(triggerRecord)}'::jsonb);
    SELECT count(*) FROM vira.application_run_state
  `);

  assertEqual(scoped("vira_api", scopeA, "SELECT count(*) FROM vira.application_run_state"), "1", "same-scope ApplicationRun read");
  assertEqual(scoped("vira_api", scopeB, "SELECT count(*) FROM vira.application_run_state"), "0", "cross-scope ApplicationRun isolation");
  assertEqual(scoped("vira_api", scopeB, "SELECT count(*) FROM vira.human_task_state"), "0", "cross-scope HumanTask isolation");
  assertEqual(scoped("vira_api", scopeB, "SELECT count(*) FROM vira.trigger_inbox_state"), "0", "cross-scope trigger isolation");

  expectFailure(`BEGIN; SET LOCAL ROLE vira_api; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','staging',true); SELECT vira.require_scope(); INSERT INTO vira.application_run_state (organization_id,project_id,environment,run_id,revision,status,record) VALUES ('acme','alpha','staging','run.api-forbidden',1,'running','${q(apiForbiddenRecord)}'::jsonb); COMMIT;`, "API runtime insert authority");
  expectFailure("BEGIN; SET LOCAL ROLE vira_api; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','staging',true); SELECT vira.require_scope(); UPDATE vira.application_run_state SET persistence_updated_at=clock_timestamp() WHERE run_id='run.prod08.001'; COMMIT;", "API runtime update authority");

  const runRevision2 = q(JSON.stringify({
    ...runRecordObject,
    revision: 2,
    status: "waiting",
    wait: { id: "wait.prod08.001", kind: "event", reference: "event:ready", dueAtUnixMs: null },
    updatedAtUnixMs: 1_900_000_000_100,
  }));
  assertEqual(scoped("vira_worker", scopeA, `UPDATE vira.application_run_state SET revision=2,status='waiting',record='${runRevision2}'::jsonb,persistence_updated_at=clock_timestamp() WHERE run_id='run.prod08.001' AND revision=1 RETURNING revision::text`), "2", "atomic ApplicationRun CAS update");
  assertEqual(scoped("vira_worker", scopeA, "WITH changed AS (UPDATE vira.application_run_state SET persistence_updated_at=clock_timestamp() WHERE run_id='run.prod08.001' AND revision=1 RETURNING 1) SELECT count(*) FROM changed"), "0", "stale ApplicationRun CAS rejection");

  expectFailure("BEGIN; SET LOCAL ROLE vira_worker; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','staging',true); SELECT vira.require_scope(); UPDATE vira.application_run_state SET run_id='run.forged' WHERE run_id='run.prod08.001'; COMMIT;", "immutable ApplicationRun identity");
  expectFailure(`BEGIN; SET LOCAL ROLE vira_worker; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','staging',true); SELECT vira.require_scope(); INSERT INTO vira.application_run_state (organization_id,project_id,environment,run_id,revision,status,record) VALUES ('bravo','beta','staging','run.cross',1,'running','${q(crossScopeRecord)}'::jsonb); COMMIT;`, "cross-scope runtime write");
  expectFailure(`BEGIN; SET LOCAL ROLE vira_worker; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','staging',true); SELECT vira.require_scope(); INSERT INTO vira.human_task_state (organization_id,project_id,environment,task_id,revision,status,record) VALUES ('acme','alpha','staging','task.mismatch',2,'assigned','${q(mismatchTaskRecord)}'::jsonb); COMMIT;`, "row/json durable revision mismatch");

  const overflowRecord = q(JSON.stringify({ ...runRecordObject, id: "run.overflow", revision: 9_007_199_254_740_992 }));
  expectFailure(`BEGIN; SET LOCAL ROLE vira_worker; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','staging',true); SELECT vira.require_scope(); INSERT INTO vira.application_run_state (organization_id,project_id,environment,run_id,revision,status,record) VALUES ('acme','alpha','staging','run.overflow',9007199254740992,'running','${overflowRecord}'::jsonb); COMMIT;`, "unsafe runtime revision");

  if (postgresToolsImage) {
    archiveTool("pg_dump", [`--dbname=${databaseUrl}`, "--format=custom", "--schema=vira", "--no-owner", "--file=/vira-proof/vira-prod08-runtime.dump"]);
  } else {
    archiveTool("pg_dump", [`--dbname=${databaseUrl}`, "--format=custom", "--schema=vira", "--no-owner", `--file=${dump}`]);
  }
  psql("DROP SCHEMA vira CASCADE;");
  if (postgresToolsImage) {
    archiveTool("pg_restore", [`--dbname=${databaseUrl}`, "--role=vira_migration", "--no-owner", "/vira-proof/vira-prod08-runtime.dump"]);
  } else {
    archiveTool("pg_restore", [`--dbname=${databaseUrl}`, "--role=vira_migration", "--no-owner", dump]);
  }

  assertEqual(scoped("vira_api", scopeA, "SELECT revision::text || '|' || status FROM vira.application_run_state WHERE run_id='run.prod08.001'"), "2|waiting", "restored ApplicationRun state");
  assertEqual(scoped("vira_api", scopeA, "SELECT status FROM vira.human_task_state WHERE task_id='task.prod08.001'"), "assigned", "restored HumanTask state");
  assertEqual(scoped("vira_api", scopeA, "SELECT status FROM vira.trigger_inbox_state WHERE source_ref='provider.github.webhook' AND event_id='event.prod08.001'"), "pending", "restored trigger inbox state");
  assertEqual(scoped("vira_api", scopeB, "SELECT count(*) FROM vira.application_run_state"), "0", "restored cross-scope isolation");

  execFileSync("node", [path.join(root, "ops/postgres/apply-migrations.mjs")], {
    cwd: root,
    env: { ...process.env, VIRA_DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
  process.stdout.write("PROD-08 Application runtime PostgreSQL durability, CAS, isolation and restore verification passed.\n");
} finally {
  cleanupFixtures();
  rmSync(temp, { recursive: true, force: true });
}
