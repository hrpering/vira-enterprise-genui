import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.VIRA_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("VIRA_TEST_DATABASE_URL is required for the PROD-09 async Capability job DB gate");
const parsed = new URL(databaseUrl);
if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") throw new Error("VIRA_TEST_DATABASE_URL must use postgres/postgresql");

const scopeA = { organizationId: "acme", projectId: "alpha", environment: "staging" };
const scopeB = { organizationId: "bravo", projectId: "beta", environment: "staging" };
const NOW = 1_900_000_000_000;
const digest = "a".repeat(64);

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

function q(value) {
  return value.replaceAll("'", "''");
}

function cleanupFixtures() {
  try {
    psql("DELETE FROM vira.hosted_capability_job_state WHERE job_id IN ('job.prod09.restart.001','job.prod09.api-forbidden','job.prod09.cross','job.prod09.mismatch','job.prod09.overflow');");
  } catch {
    // Preserve the original gate failure when schema/state is unavailable.
  }
}

const runningRecordObject = {
  version: "1",
  id: "job.prod09.restart.001",
  scope: { version: "1", organizationId: "acme", projectId: "alpha", environment: "staging" },
  revision: 1,
  status: "running",
  invocationId: "invocation-prod09-restart-001",
  capabilityRef: { id: "demo.capability.document.export", versionRef: "1.0.0" },
  bindingRef: { id: "demo.binding.document.export", versionRef: "1.0.0" },
  providerId: "demo",
  providerConnectionId: "demo.connection",
  trustEvidenceId: "trust.demo.connection.e001",
  providerJobRef: "provider-job-prod09-restart-001",
  completionMode: "poll",
  retryPolicy: "query-safe",
  deadlineEpochMs: NOW + 60_000,
  startedAtEpochMs: NOW,
  updatedAtEpochMs: NOW,
  cancelRequestedAtEpochMs: null,
  cancelledAtEpochMs: null,
  timedOutAtEpochMs: null,
  completion: null,
};
const runningRecord = JSON.stringify(runningRecordObject);
const apiForbiddenRecord = JSON.stringify({ ...runningRecordObject, id: "job.prod09.api-forbidden" });
const crossRecord = JSON.stringify({
  ...runningRecordObject,
  id: "job.prod09.cross",
  scope: { version: "1", organizationId: "bravo", projectId: "beta", environment: "staging" },
});

try {
  execFileSync("node", [path.join(root, "ops/postgres/apply-migrations.mjs")], {
    cwd: root,
    env: { ...process.env, VIRA_DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  cleanupFixtures();

  assertEqual(psql("SELECT count(*) FROM vira.schema_migrations WHERE version = 5 AND name = 'prod09_async_capability_job'"), "1", "PROD-09 migration evidence");
  assertEqual(psql("SELECT has_table_privilege('vira_api','vira.hosted_capability_job_state','INSERT')"), "f", "API async job INSERT privilege");
  assertEqual(psql("SELECT has_column_privilege('vira_api','vira.hosted_capability_job_state','revision','UPDATE')"), "f", "API async job UPDATE privilege");
  assertEqual(psql("SELECT has_table_privilege('vira_worker','vira.hosted_capability_job_state','INSERT')"), "t", "worker async job INSERT privilege");
  assertEqual(psql("SELECT has_column_privilege('vira_worker','vira.hosted_capability_job_state','revision','UPDATE')"), "t", "worker async job CAS UPDATE privilege");
  assertEqual(psql("SELECT has_table_privilege('vira_worker','vira.hosted_capability_job_state','DELETE')"), "f", "worker async job DELETE privilege");
  assertEqual(psql("BEGIN; SET LOCAL ROLE vira_api; SELECT count(*) FROM vira.hosted_capability_job_state; ROLLBACK;"), "0", "missing-scope async job RLS");

  scoped("vira_worker", scopeA, `
    INSERT INTO vira.hosted_capability_job_state (organization_id,project_id,environment,job_id,revision,status,record)
    VALUES ('acme','alpha','staging','job.prod09.restart.001',1,'running','${q(runningRecord)}'::jsonb);
    SELECT revision::text || '|' || status FROM vira.hosted_capability_job_state WHERE job_id='job.prod09.restart.001'
  `);

  assertEqual(scoped("vira_api", scopeA, "SELECT revision::text || '|' || status FROM vira.hosted_capability_job_state WHERE job_id='job.prod09.restart.001'"), "1|running", "fresh API process resumes running async job");
  assertEqual(scoped("vira_api", scopeB, "SELECT count(*) FROM vira.hosted_capability_job_state WHERE job_id='job.prod09.restart.001'"), "0", "cross-scope async job isolation");

  expectFailure(`BEGIN; SET LOCAL ROLE vira_api; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','staging',true); SELECT vira.require_scope(); INSERT INTO vira.hosted_capability_job_state (organization_id,project_id,environment,job_id,revision,status,record) VALUES ('acme','alpha','staging','job.prod09.api-forbidden',1,'running','${q(apiForbiddenRecord)}'::jsonb); COMMIT;`, "API async job insert authority");
  expectFailure("BEGIN; SET LOCAL ROLE vira_api; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','staging',true); SELECT vira.require_scope(); UPDATE vira.hosted_capability_job_state SET persistence_updated_at=clock_timestamp() WHERE job_id='job.prod09.restart.001'; COMMIT;", "API async job update authority");

  const cancelRequestedRecord = q(JSON.stringify({
    ...runningRecordObject,
    revision: 2,
    status: "cancel-requested",
    updatedAtEpochMs: NOW + 1_000,
    cancelRequestedAtEpochMs: NOW + 1_000,
  }));
  assertEqual(scoped("vira_worker", scopeA, `UPDATE vira.hosted_capability_job_state SET revision=2,status='cancel-requested',record='${cancelRequestedRecord}'::jsonb,persistence_updated_at=clock_timestamp() WHERE job_id='job.prod09.restart.001' AND revision=1 RETURNING revision::text`), "2", "fresh worker process persists cancel-requested separately from cancelled");
  assertEqual(scoped("vira_api", scopeA, "SELECT revision::text || '|' || status FROM vira.hosted_capability_job_state WHERE job_id='job.prod09.restart.001'"), "2|cancel-requested", "fresh API process resumes cancellation ambiguity");
  assertEqual(scoped("vira_worker", scopeA, "WITH changed AS (UPDATE vira.hosted_capability_job_state SET persistence_updated_at=clock_timestamp() WHERE job_id='job.prod09.restart.001' AND revision=1 RETURNING 1) SELECT count(*) FROM changed"), "0", "stale async job CAS rejection");

  const completedRecord = q(JSON.stringify({
    ...runningRecordObject,
    revision: 3,
    status: "completed",
    updatedAtEpochMs: NOW + 2_000,
    cancelRequestedAtEpochMs: NOW + 1_000,
    completion: {
      source: "poll",
      completionId: "completion-prod09-restart-001",
      completedAtEpochMs: NOW + 1_500,
      result: { outcome: "empty", resultDigest: digest },
    },
  }));
  assertEqual(scoped("vira_worker", scopeA, `UPDATE vira.hosted_capability_job_state SET revision=3,status='completed',record='${completedRecord}'::jsonb,persistence_updated_at=clock_timestamp() WHERE job_id='job.prod09.restart.001' AND revision=2 RETURNING revision::text`), "3", "fresh worker process completes provider-won cancellation race");
  assertEqual(scoped("vira_api", scopeA, "SELECT revision::text || '|' || status || '|' || (record->'completion'->>'completionId') FROM vira.hosted_capability_job_state WHERE job_id='job.prod09.restart.001'"), "3|completed|completion-prod09-restart-001", "fresh API process resumes completed async job");

  expectFailure(`BEGIN; SET LOCAL ROLE vira_worker; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','staging',true); SELECT vira.require_scope(); INSERT INTO vira.hosted_capability_job_state (organization_id,project_id,environment,job_id,revision,status,record) VALUES ('bravo','beta','staging','job.prod09.cross',1,'running','${q(crossRecord)}'::jsonb); COMMIT;`, "cross-scope async job write");
  expectFailure(`BEGIN; SET LOCAL ROLE vira_worker; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','staging',true); SELECT vira.require_scope(); INSERT INTO vira.hosted_capability_job_state (organization_id,project_id,environment,job_id,revision,status,record) VALUES ('acme','alpha','staging','job.prod09.mismatch',2,'running','${q(JSON.stringify({ ...runningRecordObject, id: "job.prod09.mismatch" }))}'::jsonb); COMMIT;`, "row/json async job revision mismatch");
  expectFailure(`BEGIN; SET LOCAL ROLE vira_worker; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','staging',true); SELECT vira.require_scope(); INSERT INTO vira.hosted_capability_job_state (organization_id,project_id,environment,job_id,revision,status,record) VALUES ('acme','alpha','staging','job.prod09.overflow',9007199254740992,'running','${q(JSON.stringify({ ...runningRecordObject, id: "job.prod09.overflow", revision: 9_007_199_254_740_992 }))}'::jsonb); COMMIT;`, "unsafe async job revision");

  process.stdout.write("PROD-09 async Capability job live PostgreSQL restart, RLS, CAS, and cancellation-ambiguity verification passed.\n");
} finally {
  cleanupFixtures();
}
