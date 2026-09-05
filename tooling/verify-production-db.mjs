import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const failures = [];
const requireText = (source, needle, label) => { if (!source.includes(needle)) failures.push(`${label}: missing ${needle}`); };

const roles = await read("integrations/postgres/bootstrap/roles.sql");
const migration = await read("integrations/postgres/migrations/000001_prod02_foundation.sql");
const transaction = await read("integrations/postgres/src/transaction.ts");
const liveVerifier = await read("tooling/verify-production-db-live.mjs");
const packageJson = JSON.parse(await read("package.json"));
const tsconfig = await read("tsconfig.json");
const buildTsconfig = await read("tsconfig.build.json");
const workflow = await read(".github/workflows/ci.yml");
const migrationFiles = await readdir(path.join(root, "integrations/postgres/migrations"));

for (const role of ["vira_migration", "vira_api", "vira_worker", "vira_ops"]) {
  requireText(roles, role, "roles");
}
for (const hardening of ["NOSUPERUSER", "NOCREATEDB", "NOCREATEROLE", "NOREPLICATION", "NOBYPASSRLS"]) {
  requireText(roles, hardening, "roles");
}
requireText(migration, "vira.schema_migrations", "migration");
requireText(migration, "pg_advisory_xact_lock", "migration");
requireText(migration, "migration_checksum", "migration");
requireText(migration, "vira.scope_matches", "migration");
requireText(migration, "vira.require_scope", "migration");
requireText(migration, "REVOKE ALL ON TABLE vira.schema_migrations FROM PUBLIC, vira_api, vira_worker, vira_ops", "migration");

const creates = [...migration.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([^\s(]+)/g)].map((match) => match[1]);
if (creates.length !== 1 || creates[0] !== "vira.schema_migrations") {
  failures.push(`migration: PROD-02 foundation may create only vira.schema_migrations, found ${creates.join(", ")}`);
}
if (migrationFiles.some((name) => name.endsWith(".down.sql"))) failures.push("migrations: down migrations are forbidden by the forward-only decision");
if (migrationFiles.some((name) => !/^\d{6}_[a-z0-9_]+\.sql$/.test(name))) failures.push("migrations: every migration must have a six-digit immutable sequence name");

requireText(transaction, "createViraEnterpriseContext", "transaction helper");
requireText(transaction, "../../../packages/enterprise-context/src/index.js", "transaction helper");
requireText(transaction, "set_config('vira.organization_id', $1, true)", "transaction helper");
requireText(transaction, "set_config('vira.project_id', $2, true)", "transaction helper");
requireText(transaction, "set_config('vira.environment', $3, true)", "transaction helper");
requireText(transaction, "SELECT vira.require_scope()", "transaction helper");

if (!packageJson.scripts?.["verify:production-db:static"] || !packageJson.scripts?.["verify:production-db"] || !packageJson.scripts?.["verify:tenant-isolation"]) {
  failures.push("package.json: production DB verification scripts are incomplete");
}
requireText(tsconfig, '"integrations/**/*.ts"', "tsconfig");
requireText(buildTsconfig, '"integrations/**/*.ts"', "build tsconfig");
requireText(workflow, "postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3", "CI");
requireText(workflow, "VIRA_TEST_DATABASE_URL", "CI");
requireText(workflow, "VIRA_POSTGRES_TOOLS_IMAGE", "CI");
requireText(workflow, "pnpm verify:production-db", "CI");
requireText(liveVerifier, "postgresToolsImage", "live verifier");
requireText(liveVerifier, '"--network",\n      "host"', "live verifier");

for (const forbidden of ["packages/transaction-store", "packages/evidence-store", "packages/application-deployment"]) {
  try {
    await access(path.join(root, forbidden));
    failures.push(`forbidden semantic owner exists: ${forbidden}`);
  } catch {
    // expected
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Production PostgreSQL structural verification passed.\n");
}
