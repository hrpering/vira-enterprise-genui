import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.VIRA_TEST_DATABASE_URL;
const postgresToolsImage = process.env.VIRA_POSTGRES_TOOLS_IMAGE;
if (!databaseUrl) throw new Error("VIRA_TEST_DATABASE_URL is required for the Application deployment DB gate");
const parsed = new URL(databaseUrl);
if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") throw new Error("VIRA_TEST_DATABASE_URL must use postgres/postgresql");

const temp = mkdtempSync(path.join(os.tmpdir(), "vira-prod05-"));
const dump = path.join(temp, "vira-prod05.dump");
const scopeA = { organizationId: "acme", projectId: "alpha", environment: "dev" };
const scopeAOtherProject = { organizationId: "acme", projectId: "gamma", environment: "dev" };
const scopeB = { organizationId: "bravo", projectId: "beta", environment: "dev" };

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

const releaseJson = JSON.stringify({ schemaVersion: "2", application: { identity: { id: "acme.flight" }, version: "1.0.0", publisher: { id: "acme" } }, integrity: { algorithm: "sha256", digest: "a".repeat(64) } });
const provenanceJson = JSON.stringify({ version: "1", publisherId: "acme", principal: { version: "1", kind: "service", id: "publisher", organizationId: "acme" }, authenticationRef: "auth:acme:1" });
const signatureJson = JSON.stringify({ algorithm: "ed25519", keyId: "key:acme:1", value: "abcdefghijklmnop" });
const bindingDev = JSON.stringify({ version: "1", bindingRef: "binding:acme:alpha:dev:1", scope: { version: "1", organizationId: "acme", projectId: "alpha", environment: "dev" }, providerIdentityRef: "provider:acme:1", location: "eu-central", adapterRef: "adapter:flight:1", secretRef: { version: "1", organizationId: "acme", projectId: "alpha", environment: "dev", provider: "kms", key: "flight" }, trustStatus: "trusted", trustEvidenceRef: "trust:acme:1" });

try {
  execFileSync("node", [path.join(root, "ops/postgres/apply-migrations.mjs")], {
    cwd: root,
    env: { ...process.env, VIRA_DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  assertEqual(psql("SELECT count(*) FROM vira.schema_migrations WHERE version = 3 AND name = 'prod05_application_deployment'"), "1", "PROD-05 migration evidence");
  assertEqual(psql("BEGIN; SET LOCAL ROLE vira_api; SELECT count(*) FROM vira.application_activation; ROLLBACK;"), "0", "missing-scope activation RLS");

  scoped("vira_api", scopeA, `
    INSERT INTO vira.application_release (
      publisher_organization_id,publisher_project_id,application_id,application_version,distribution_digest,artifact_id,publisher_id,distribution,provenance,signature,status
    ) VALUES ('acme','alpha','acme.flight','1.0.0',repeat('a',64),'artifact:acme.flight:1.0.0','acme','${releaseJson.replaceAll("'", "''")}'::jsonb,'${provenanceJson.replaceAll("'", "''")}'::jsonb,'${signatureJson.replaceAll("'", "''")}'::jsonb,'active');
    INSERT INTO vira.application_deployment (
      organization_id,project_id,environment,application_id,revision,deployment_id,application_version,distribution_digest,artifact_id,publisher_organization_id,binding,operation
    ) VALUES ('acme','alpha','dev','acme.flight',1,'deployment:acme:alpha:dev:acme.flight:1','1.0.0',repeat('a',64),'artifact:acme.flight:1.0.0','acme','${bindingDev.replaceAll("'", "''")}'::jsonb,'publish');
    INSERT INTO vira.application_activation (
      organization_id,project_id,environment,application_id,deployment_id,revision,application_version,distribution_digest,artifact_id
    ) VALUES ('acme','alpha','dev','acme.flight','deployment:acme:alpha:dev:acme.flight:1',1,'1.0.0',repeat('a',64),'artifact:acme.flight:1.0.0');
    SELECT deployment_id FROM vira.application_activation WHERE application_id='acme.flight'
  `);

  assertEqual(scoped("vira_api", scopeA, "SELECT deployment_id FROM vira.application_activation WHERE application_id='acme.flight'"), "deployment:acme:alpha:dev:acme.flight:1", "tenant activation read");
  assertEqual(scoped("vira_api", scopeB, "SELECT count(*) FROM vira.application_release WHERE application_id='acme.flight'"), "0", "cross-org release isolation");
  assertEqual(scoped("vira_api", scopeB, "SELECT count(*) FROM vira.application_activation WHERE application_id='acme.flight'"), "0", "cross-org activation isolation");
  assertEqual(scoped("vira_api", scopeAOtherProject, "SELECT count(*) FROM vira.application_release WHERE application_id='acme.flight'"), "1", "same-org release readability");
  assertEqual(scoped("vira_api", scopeAOtherProject, "UPDATE vira.application_release SET status='deprecated' WHERE application_id='acme.flight'; SELECT status FROM vira.application_release WHERE application_id='acme.flight'"), "active", "publisher-project status ownership");

  expectFailure(`BEGIN; SET LOCAL ROLE vira_api; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','dev',true); SELECT vira.require_scope(); UPDATE vira.application_release SET distribution='{}'::jsonb WHERE application_id='acme.flight' AND application_version='1.0.0'; COMMIT;`, "signed release immutable column update");

  expectFailure(`BEGIN; SET LOCAL ROLE vira_api; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','dev',true); SELECT vira.require_scope(); UPDATE vira.application_activation SET application_id='acme.renamed' WHERE application_id='acme.flight'; COMMIT;`, "activation identity column update");

  expectFailure(`BEGIN; SET LOCAL ROLE vira_api; SELECT set_config('vira.organization_id','bravo',true); SELECT set_config('vira.project_id','beta',true); SELECT set_config('vira.environment','dev',true); SELECT vira.require_scope(); INSERT INTO vira.application_activation (organization_id,project_id,environment,application_id,deployment_id,revision,application_version,distribution_digest,artifact_id) VALUES ('bravo','beta','dev','acme.flight','deployment:acme:alpha:dev:acme.flight:1',1,'1.0.0',repeat('a',64),'artifact:acme.flight:1.0.0'); COMMIT;`, "cross-tenant activation pointer confusion");

  expectFailure(`BEGIN; SET LOCAL ROLE vira_api; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','dev',true); SELECT vira.require_scope(); INSERT INTO vira.application_deployment (organization_id,project_id,environment,application_id,revision,deployment_id,application_version,distribution_digest,artifact_id,publisher_organization_id,binding,operation) VALUES ('acme','alpha','dev','acme.flight',99,'forged-artifact-pointer','1.0.0',repeat('a',64),'artifact:forged','acme','${bindingDev.replaceAll("'", "''")}'::jsonb,'publish'); COMMIT;`, "deployment artifact pointer confusion");

  expectFailure(`BEGIN; SET LOCAL ROLE vira_api; SELECT set_config('vira.organization_id','bravo',true); SELECT set_config('vira.project_id','beta',true); SELECT set_config('vira.environment','dev',true); INSERT INTO vira.application_deployment (organization_id,project_id,environment,application_id,revision,deployment_id,application_version,distribution_digest,artifact_id,publisher_organization_id,binding,operation) VALUES ('bravo','beta','dev','acme.flight',1,'forbidden-cross-org','1.0.0',repeat('a',64),'artifact:acme.flight:1.0.0','bravo','{}'::jsonb,'publish'); COMMIT;`, "cross-org release FK");

  scoped("vira_api", scopeA, `
    INSERT INTO vira.application_release (
      publisher_organization_id,publisher_project_id,application_id,application_version,distribution_digest,artifact_id,publisher_id,distribution,provenance,signature,status
    ) VALUES ('acme','alpha','acme.research','1.0.0',repeat('b',64),'artifact:acme.research:1.0.0','acme','{}'::jsonb,'${provenanceJson.replaceAll("'", "''")}'::jsonb,'${signatureJson.replaceAll("'", "''")}'::jsonb,'active');
    INSERT INTO vira.application_deployment (
      organization_id,project_id,environment,application_id,revision,deployment_id,application_version,distribution_digest,artifact_id,publisher_organization_id,binding,operation
    ) VALUES ('acme','alpha','dev','acme.research',1,'deployment:acme:alpha:dev:acme.research:1','1.0.0',repeat('b',64),'artifact:acme.research:1.0.0','acme','${bindingDev.replaceAll("'", "''")}'::jsonb,'publish');
    INSERT INTO vira.application_activation (
      organization_id,project_id,environment,application_id,deployment_id,revision,application_version,distribution_digest,artifact_id
    ) VALUES ('acme','alpha','dev','acme.research','deployment:acme:alpha:dev:acme.research:1',1,'1.0.0',repeat('b',64),'artifact:acme.research:1.0.0');
    SELECT count(*) FROM vira.application_activation
  `);
  assertEqual(scoped("vira_api", scopeA, "SELECT count(*) FROM vira.application_activation"), "2", "multiple Applications per tenant environment");

  expectFailure(`BEGIN; SET LOCAL ROLE vira_api; SELECT set_config('vira.organization_id','acme',true); SELECT set_config('vira.project_id','alpha',true); SELECT set_config('vira.environment','dev',true); SELECT vira.require_scope(); INSERT INTO vira.application_deployment (organization_id,project_id,environment,application_id,revision,deployment_id,application_version,distribution_digest,artifact_id,publisher_organization_id,binding,operation,previous_deployment_id) VALUES ('acme','alpha','dev','acme.flight',3,'forbidden-cross-application-lineage','1.0.0',repeat('a',64),'artifact:acme.flight:1.0.0','acme','${bindingDev.replaceAll("'", "''")}'::jsonb,'rollback','deployment:acme:alpha:dev:acme.research:1'); COMMIT;`, "cross-Application previous deployment lineage");

  scoped("vira_api", scopeA, `
    INSERT INTO vira.application_deployment (
      organization_id,project_id,environment,application_id,revision,deployment_id,application_version,distribution_digest,artifact_id,publisher_organization_id,binding,operation,previous_deployment_id
    ) VALUES ('acme','alpha','dev','acme.flight',2,'deployment:acme:alpha:dev:acme.flight:2','1.0.0',repeat('a',64),'artifact:acme.flight:1.0.0','acme','${bindingDev.replaceAll("'", "''")}'::jsonb,'rollback','deployment:acme:alpha:dev:acme.flight:1');
    UPDATE vira.application_activation SET deployment_id='deployment:acme:alpha:dev:acme.flight:2', revision=2 WHERE application_id='acme.flight';
    SELECT revision::text FROM vira.application_activation WHERE application_id='acme.flight'
  `);
  assertEqual(scoped("vira_api", scopeA, "SELECT count(*) FROM vira.application_deployment WHERE application_id='acme.flight'"), "2", "append-only deployment history");

  if (postgresToolsImage) {
    archiveTool("pg_dump", [`--dbname=${databaseUrl}`, "--format=custom", "--schema=vira", "--no-owner", "--file=/vira-proof/vira-prod05.dump"]);
  } else {
    archiveTool("pg_dump", [`--dbname=${databaseUrl}`, "--format=custom", "--schema=vira", "--no-owner", `--file=${dump}`]);
  }
  psql("DROP SCHEMA vira CASCADE;");
  if (postgresToolsImage) {
    archiveTool("pg_restore", [`--dbname=${databaseUrl}`, "--role=vira_migration", "--no-owner", "/vira-proof/vira-prod05.dump"]);
  } else {
    archiveTool("pg_restore", [`--dbname=${databaseUrl}`, "--role=vira_migration", "--no-owner", dump]);
  }

  assertEqual(psql("SELECT count(*) FROM vira.schema_migrations WHERE version = 3"), "1", "restored PROD-05 migration evidence");
  assertEqual(scoped("vira_api", scopeA, "SELECT deployment_id || '|' || revision::text FROM vira.application_activation WHERE application_id='acme.flight'"), "deployment:acme:alpha:dev:acme.flight:2|2", "restored exact activation");
  assertEqual(scoped("vira_api", scopeB, "SELECT count(*) FROM vira.application_activation"), "0", "restored cross-org isolation");

  execFileSync("node", [path.join(root, "ops/postgres/apply-migrations.mjs")], {
    cwd: root,
    env: { ...process.env, VIRA_DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
  process.stdout.write("Application deployment PostgreSQL persistence, isolation and restore verification passed.\n");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
