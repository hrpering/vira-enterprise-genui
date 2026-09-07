#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationRoot = path.join(root, "integrations/postgres/migrations");
const RAILWAY_GRAPHQL_ENDPOINT = "https://backboard.railway.com/graphql/v2";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const MARKER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANIFEST_KEYS = [
  "afterMarker",
  "backupId",
  "beforeMarker",
  "candidateSha",
  "environment",
  "owner",
  "restoreCompletedAt",
  "restoreStartedAt",
  "restoredServiceName",
  "restoredVolumeInstanceId",
  "sourceServiceName",
  "sourceVolumeInstanceId",
  "version",
];

function fail(message, detail = {}) {
  process.stderr.write(`${JSON.stringify({
    version: "1",
    gate: "live-postgres-backup-restore",
    authority: "live-railway-api+postgres",
    closureEligible: false,
    releaseRecoveryClosureEligible: false,
    message,
    ...detail,
  }, null, 2)}\n`);
  process.exit(1);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${name} is required`, { requiredEnvironment: [name] });
  }
  return value.trim();
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch {
    fail(`${label} must be valid JSON`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record, key, label) {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") fail(`${label}.${key} must be a non-empty string`);
  return value.trim();
}

function parseIso(raw, label) {
  const value = new globalThis.Date(raw);
  if (!Number.isFinite(value.getTime()) || value.toISOString() !== raw) {
    fail(`${label} must be an exact ISO-8601 UTC timestamp`);
  }
  return value;
}

function parseManifest(raw) {
  const value = parseJson(raw, "VIRA_RECOVERY_MANIFEST_JSON");
  if (!isRecord(value)) fail("recovery manifest must be an object");
  const keys = Object.keys(value).sort();
  if (keys.length !== MANIFEST_KEYS.length || keys.some((key, index) => key !== MANIFEST_KEYS[index])) {
    fail("recovery manifest contains missing or unknown fields", { keysObserved: keys });
  }
  if (value.version !== "1") fail("recovery manifest version must be 1");

  const environment = requiredString(value, "environment", "manifest");
  if (environment !== "staging") {
    fail("recovery rehearsal must run in the isolated staging environment", { environmentObserved: environment });
  }

  const owner = requiredString(value, "owner", "manifest");
  const candidateSha = requiredString(value, "candidateSha", "manifest").toLowerCase();
  if (!SHA_PATTERN.test(candidateSha)) fail("candidateSha must be an exact Git SHA");

  const sourceVolumeInstanceId = requiredString(value, "sourceVolumeInstanceId", "manifest").toLowerCase();
  const restoredVolumeInstanceId = requiredString(value, "restoredVolumeInstanceId", "manifest").toLowerCase();
  const backupId = requiredString(value, "backupId", "manifest").toLowerCase();
  for (const [label, id] of [
    ["sourceVolumeInstanceId", sourceVolumeInstanceId],
    ["restoredVolumeInstanceId", restoredVolumeInstanceId],
    ["backupId", backupId],
  ]) {
    if (!UUID_PATTERN.test(id)) fail(`${label} must be an exact UUID`);
  }
  if (sourceVolumeInstanceId === restoredVolumeInstanceId) {
    fail("source and restored volume instances must be independent resources");
  }

  const beforeMarker = requiredString(value, "beforeMarker", "manifest").toLowerCase();
  const afterMarker = requiredString(value, "afterMarker", "manifest").toLowerCase();
  if (!MARKER_PATTERN.test(beforeMarker) || !MARKER_PATTERN.test(afterMarker)) {
    fail("recovery markers must be UUIDs");
  }
  if (beforeMarker === afterMarker) fail("beforeMarker and afterMarker must be different");

  const restoreStartedAt = parseIso(requiredString(value, "restoreStartedAt", "manifest"), "manifest.restoreStartedAt");
  const restoreCompletedAt = parseIso(requiredString(value, "restoreCompletedAt", "manifest"), "manifest.restoreCompletedAt");
  if (restoreCompletedAt.getTime() <= restoreStartedAt.getTime()) {
    fail("restoreCompletedAt must be after restoreStartedAt");
  }

  return Object.freeze({
    version: "1",
    environment,
    owner,
    candidateSha,
    sourceVolumeInstanceId,
    restoredVolumeInstanceId,
    backupId,
    sourceServiceName: requiredString(value, "sourceServiceName", "manifest"),
    restoredServiceName: requiredString(value, "restoredServiceName", "manifest"),
    beforeMarker,
    afterMarker,
    restoreStartedAt,
    restoreCompletedAt,
  });
}

function parseDatabaseUrl(name) {
  const raw = requiredEnv(name);
  let value;
  try {
    value = new globalThis.URL(raw);
  } catch {
    fail(`${name} must be a valid PostgreSQL URL`);
  }
  if (value.protocol !== "postgres:" && value.protocol !== "postgresql:") {
    fail(`${name} must use postgres/postgresql`);
  }
  return raw;
}

function exactCheckoutSha() {
  let sha;
  let dirty;
  try {
    sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim().toLowerCase();
    dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
  } catch (error) {
    fail("Git checkout identity could not be read", { error: error instanceof Error ? error.message : "unknown" });
  }
  return { sha, dirty };
}

function expectedMigrations() {
  const names = readdirSync(migrationRoot)
    .filter((name) => /^\d{6}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (names.length === 0) fail("no numbered PostgreSQL migrations were found in the checkout");
  return names.map((filename) => {
    const match = /^(\d{6})_([a-z0-9_]+)\.sql$/.exec(filename);
    if (!match) fail("migration filename parsing failed", { filename });
    const source = readFileSync(path.join(migrationRoot, filename));
    return Object.freeze({
      version: String(Number(match[1])),
      name: match[2],
      checksum: createHash("sha256").update(source).digest("hex"),
      filename,
    });
  });
}

function psql(databaseUrl, sql) {
  try {
    return execFileSync("psql", [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    fail("PostgreSQL evidence query failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

function rows(output) {
  return output === "" ? [] : output.split(/\r?\n/).filter(Boolean);
}

function assertMigrationParity(databaseUrl, label, expected) {
  const observed = rows(psql(
    databaseUrl,
    "SELECT version::text || '|' || name || '|' || checksum FROM vira.schema_migrations ORDER BY version;",
  )).map((line) => {
    const [version, name, checksum] = line.split("|");
    return { version, name, checksum };
  });
  if (observed.length !== expected.length) {
    fail(`${label} migration count mismatch`, { expectedCount: expected.length, observedCount: observed.length });
  }
  for (let index = 0; index < expected.length; index += 1) {
    const wanted = expected[index];
    const actual = observed[index];
    if (actual.version !== wanted.version || actual.name !== wanted.name || actual.checksum !== wanted.checksum) {
      fail(`${label} migration checksum parity failed`, { expected: wanted, observed: actual });
    }
  }
}

function assertSecurityShape(databaseUrl, label) {
  const roles = rows(psql(
    databaseUrl,
    "SELECT rolname FROM pg_roles WHERE rolname IN ('vira_api','vira_migration','vira_ops','vira_worker') ORDER BY rolname;",
  ));
  const expectedRoles = ["vira_api", "vira_migration", "vira_ops", "vira_worker"];
  if (JSON.stringify(roles) !== JSON.stringify(expectedRoles)) {
    fail(`${label} required database roles are incomplete`, { rolesObserved: roles });
  }

  const functions = rows(psql(
    databaseUrl,
    "SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='vira' AND p.proname IN ('require_scope','scope_matches') ORDER BY p.proname;",
  ));
  if (JSON.stringify(functions) !== JSON.stringify(["require_scope", "scope_matches"])) {
    fail(`${label} scope enforcement functions are incomplete`, { functionsObserved: functions });
  }

  const unsafeTenantTables = rows(psql(databaseUrl, `
    WITH tenant_tables AS (
      SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'vira'
        AND c.relkind IN ('r','p')
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organization_id' AND a.attnum>0 AND NOT a.attisdropped)
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='project_id' AND a.attnum>0 AND NOT a.attisdropped)
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='environment' AND a.attnum>0 AND NOT a.attisdropped)
    )
    SELECT relname FROM tenant_tables WHERE NOT relrowsecurity OR NOT relforcerowsecurity ORDER BY relname;
  `));
  if (unsafeTenantTables.length > 0) {
    fail(`${label} contains tenant tables without forced RLS`, { unsafeTenantTables });
  }

  const migrationPrivileges = psql(databaseUrl, `
    SELECT
      has_table_privilege('vira_api','vira.schema_migrations','INSERT')::text || '|' ||
      has_table_privilege('vira_api','vira.schema_migrations','UPDATE')::text || '|' ||
      has_table_privilege('vira_api','vira.schema_migrations','DELETE')::text;
  `);
  if (migrationPrivileges !== "false|false|false") {
    fail(`${label} API role has migration-evidence write authority`, { migrationPrivileges });
  }
}

function markerEvidence(databaseUrl, beforeMarker, afterMarker, label) {
  const output = rows(psql(databaseUrl, `
    SELECT marker || '|' || to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    FROM vira.recovery_drill_markers
    WHERE marker IN ('${beforeMarker}','${afterMarker}')
    ORDER BY created_at, marker;
  `));
  const evidence = new Map();
  for (const line of output) {
    const separator = line.indexOf("|");
    if (separator <= 0) fail(`${label} recovery marker row is malformed`);
    evidence.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return evidence;
}

async function railwayGraphql(token, query, variables, label) {
  let response;
  try {
    response = await globalThis.fetch(RAILWAY_GRAPHQL_ENDPOINT, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "vira-enterprise-genui-recovery-verifier",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    fail(`${label} Railway API request failed`, { error: error instanceof Error ? error.message : "unknown" });
  }
  const text = await response.text();
  let body;
  try {
    body = text === "" ? null : JSON.parse(text);
  } catch {
    fail(`${label} Railway API returned non-JSON`, { httpStatus: response.status });
  }
  if (!response.ok) fail(`${label} Railway API returned non-success`, { httpStatus: response.status, body });
  if (!isRecord(body) || (Array.isArray(body.errors) && body.errors.length > 0) || !isRecord(body.data)) {
    fail(`${label} Railway GraphQL response contains errors`, { body });
  }
  return body.data;
}

async function railwayVolumeInstance(token, id, label) {
  const data = await railwayGraphql(token, `
    query volumeInstance($id: String!) {
      volumeInstance(id: $id) {
        id
        mountPath
        currentSizeMB
        state
        volume { id name }
        serviceInstance { serviceName }
      }
    }
  `, { id }, label);
  if (!isRecord(data.volumeInstance)) fail(`${label} volume instance was not found`, { id });
  return data.volumeInstance;
}

async function railwayBackup(token, sourceVolumeInstanceId, backupId) {
  const data = await railwayGraphql(token, `
    query volumeInstanceBackupList($volumeInstanceId: String!) {
      volumeInstanceBackupList(volumeInstanceId: $volumeInstanceId) {
        id
        name
        createdAt
        expiresAt
        usedMB
        referencedMB
      }
    }
  `, { volumeInstanceId: sourceVolumeInstanceId }, "backup provenance");
  if (!Array.isArray(data.volumeInstanceBackupList)) {
    fail("backup provenance response is not a list");
  }
  const backup = data.volumeInstanceBackupList.find((entry) => isRecord(entry) && String(entry.id).toLowerCase() === backupId);
  if (!isRecord(backup)) fail("exact Railway backup ID is not attached to the source volume instance", { backupId, sourceVolumeInstanceId });
  return backup;
}

function assertVolume(volumeInstance, expectedId, expectedServiceName, label) {
  if (String(volumeInstance.id).toLowerCase() !== expectedId) fail(`${label} volume instance ID mismatch`);
  if (!isRecord(volumeInstance.volume) || typeof volumeInstance.volume.id !== "string" || volumeInstance.volume.id === "") {
    fail(`${label} volume identity is missing`);
  }
  if (!isRecord(volumeInstance.serviceInstance) || volumeInstance.serviceInstance.serviceName !== expectedServiceName) {
    fail(`${label} service identity mismatch`, { expectedServiceName, observed: volumeInstance.serviceInstance });
  }
  if (volumeInstance.mountPath !== "/var/lib/postgresql/data") {
    fail(`${label} PostgreSQL mount path mismatch`, { mountPathObserved: volumeInstance.mountPath });
  }
}

const manifest = parseManifest(requiredEnv("VIRA_RECOVERY_MANIFEST_JSON"));
const railwayToken = process.env.VIRA_RAILWAY_READ_TOKEN?.trim() || process.env.RAILWAY_TOKEN?.trim();
if (!railwayToken) {
  fail("Railway read authority is required", { requiredEnvironment: ["VIRA_RAILWAY_READ_TOKEN"] });
}
const sourceDatabaseUrl = parseDatabaseUrl("VIRA_RECOVERY_SOURCE_DATABASE_URL");
const restoredDatabaseUrl = parseDatabaseUrl("VIRA_RECOVERY_RESTORED_DATABASE_URL");
if (sourceDatabaseUrl === restoredDatabaseUrl) fail("source and restored PostgreSQL URLs must be independent");

const checkout = exactCheckoutSha();
if (checkout.sha !== manifest.candidateSha) {
  fail("recovery evidence must run from the exact candidate Git SHA", { expected: manifest.candidateSha, observed: checkout.sha });
}
if (checkout.dirty !== "") fail("recovery evidence requires a clean Git checkout");

const migrations = expectedMigrations();
const sourceMarkers = markerEvidence(sourceDatabaseUrl, manifest.beforeMarker, manifest.afterMarker, "source database");
if (!sourceMarkers.has(manifest.beforeMarker) || !sourceMarkers.has(manifest.afterMarker)) {
  fail("source database must contain both pre-backup and post-backup recovery markers", {
    markersObserved: [...sourceMarkers.keys()],
  });
}

const restoredMarkers = markerEvidence(restoredDatabaseUrl, manifest.beforeMarker, manifest.afterMarker, "restored database");
if (!restoredMarkers.has(manifest.beforeMarker) || restoredMarkers.has(manifest.afterMarker)) {
  fail("restored database does not prove the selected backup boundary", {
    markersObserved: [...restoredMarkers.keys()],
    expectedPresent: manifest.beforeMarker,
    expectedAbsent: manifest.afterMarker,
  });
}

assertMigrationParity(sourceDatabaseUrl, "source database", migrations);
assertMigrationParity(restoredDatabaseUrl, "restored database", migrations);
assertSecurityShape(restoredDatabaseUrl, "restored database");

const backup = await railwayBackup(railwayToken, manifest.sourceVolumeInstanceId, manifest.backupId);
const backupCreatedAt = parseIso(requiredString(backup, "createdAt", "backup"), "backup.createdAt");
const beforeCreatedAt = parseIso(sourceMarkers.get(manifest.beforeMarker), "before marker created_at");
const afterCreatedAt = parseIso(sourceMarkers.get(manifest.afterMarker), "after marker created_at");
if (!(beforeCreatedAt.getTime() < backupCreatedAt.getTime() && backupCreatedAt.getTime() < afterCreatedAt.getTime())) {
  fail("Railway backup timestamp is not bracketed by the source recovery markers", {
    beforeCreatedAt: beforeCreatedAt.toISOString(),
    backupCreatedAt: backupCreatedAt.toISOString(),
    afterCreatedAt: afterCreatedAt.toISOString(),
  });
}

const sourceVolume = await railwayVolumeInstance(railwayToken, manifest.sourceVolumeInstanceId, "source");
const restoredVolume = await railwayVolumeInstance(railwayToken, manifest.restoredVolumeInstanceId, "restored");
assertVolume(sourceVolume, manifest.sourceVolumeInstanceId, manifest.sourceServiceName, "source");
assertVolume(restoredVolume, manifest.restoredVolumeInstanceId, manifest.restoredServiceName, "restored");
if (String(sourceVolume.volume.id).toLowerCase() === String(restoredVolume.volume.id).toLowerCase()) {
  fail("restore rehearsal did not produce an independent Railway volume resource");
}

const manifestDigest = createHash("sha256").update(requiredEnv("VIRA_RECOVERY_MANIFEST_JSON")).digest("hex");
const rtoSeconds = Math.round((manifest.restoreCompletedAt.getTime() - manifest.restoreStartedAt.getTime()) / 1000);

process.stdout.write(`${JSON.stringify({
  version: "1",
  gate: "live-postgres-backup-restore",
  authority: "live-railway-api+postgres",
  owner: manifest.owner,
  environment: manifest.environment,
  candidateSha: manifest.candidateSha,
  manifestDigest,
  backup: {
    id: manifest.backupId,
    createdAt: backupCreatedAt.toISOString(),
    name: typeof backup.name === "string" ? backup.name : null,
    expiresAt: typeof backup.expiresAt === "string" ? backup.expiresAt : null,
    usedMB: backup.usedMB ?? null,
    referencedMB: backup.referencedMB ?? null,
  },
  source: {
    volumeInstanceId: manifest.sourceVolumeInstanceId,
    volumeId: sourceVolume.volume.id,
    serviceName: manifest.sourceServiceName,
  },
  restored: {
    volumeInstanceId: manifest.restoredVolumeInstanceId,
    volumeId: restoredVolume.volume.id,
    serviceName: manifest.restoredServiceName,
  },
  markers: {
    before: manifest.beforeMarker,
    after: manifest.afterMarker,
    backupBoundaryVerified: true,
  },
  migrations: {
    count: migrations.length,
    exactChecksumParity: true,
  },
  restoredSecurity: {
    requiredRoles: true,
    scopeFunctions: true,
    forcedTenantRls: true,
    apiCannotWriteMigrationEvidence: true,
  },
  recovery: {
    restoreStartedAt: manifest.restoreStartedAt.toISOString(),
    restoreCompletedAt: manifest.restoreCompletedAt.toISOString(),
    rtoSeconds,
  },
  immutableEvidenceRef: `railway-volume-backup:${manifest.backupId}`,
  observedAt: new globalThis.Date().toISOString(),
  closureEligible: true,
  releaseRecoveryClosureEligible: false,
  openBlockers: ["migration-rollback-rehearsal"],
}, null, 2)}\n`);
