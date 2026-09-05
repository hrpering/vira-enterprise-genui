import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");
const postgresRoot = path.join(root, "integrations/postgres");
const databaseUrl = process.env.VIRA_DATABASE_URL ?? process.env.VIRA_TEST_DATABASE_URL;

if (!databaseUrl) throw new Error("VIRA_DATABASE_URL is required to apply production migrations");
const parsed = new URL(databaseUrl);
if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
  throw new Error("VIRA_DATABASE_URL must use postgres/postgresql");
}

function psql(args) {
  execFileSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", ...args], { stdio: "inherit" });
}

psql(["-f", path.join(postgresRoot, "bootstrap/roles.sql")]);

const migrationRoot = path.join(postgresRoot, "migrations");
const migrations = readdirSync(migrationRoot)
  .filter((name) => /^\d{6}_[a-z0-9_]+\.sql$/.test(name))
  .sort();

if (migrations.length === 0) throw new Error("No PostgreSQL migrations were found");

for (const migration of migrations) {
  const absolute = path.join(migrationRoot, migration);
  const source = readFileSync(absolute);
  const checksum = createHash("sha256").update(source).digest("hex");
  process.stdout.write(`Applying/verifying ${migration}\n`);
  psql(["-v", `migration_checksum=${checksum}`, "-f", absolute]);
}
