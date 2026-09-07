import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationRoot = path.join(root, "integrations/postgres/migrations");
const names = readdirSync(migrationRoot).filter((name) => /^\d{6}_[a-z0-9_]+\.sql$/.test(name)).sort();
if (names.length === 0) throw new Error("No forward migrations found");
const seenVersions = new Set();
for (const name of names) {
  const version = name.slice(0, 6);
  if (seenVersions.has(version)) throw new Error(`Duplicate migration version ${version}`);
  seenVersions.add(version);
  const source = readFileSync(path.join(migrationRoot, name), "utf8");
  if (!/BEGIN;/i.test(source) || !/COMMIT;/i.test(source)) throw new Error(`${name} must be transactional`);
  if (/\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE)\b/i.test(source)) throw new Error(`${name} contains an unsafe destructive operation`);
  createHash("sha256").update(source).digest("hex");
}
process.stdout.write(`PROD16_MIGRATIONS_SAFE count=${names.length}\n`);
