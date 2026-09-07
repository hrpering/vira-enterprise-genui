import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const failures = [];
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(`${label}: missing ${needle}`);
};

const identityOwner = await read("packages/enterprise-context/src/identity.ts");
const oidc = await read("integrations/identity-oidc/src/verify.ts");
const oidcDiscovery = await read("integrations/identity-oidc/src/discovery.ts");
const browser = await read("integrations/browser-session/src/session.ts");
const persistedBrowser = await read("integrations/browser-session/src/persisted.ts");
const bff = await read("integrations/browser-session/src/bff.ts");
const postgresSession = await read("integrations/postgres/src/identity-session.ts");
const railwayIngress = await read("apps/vira-api/src/bff-ingress.ts");
const vercelBff = await read("apps/vira-web/api/bff.ts");
const migration = await read("integrations/postgres/migrations/000002_prod03_identity_delegation.sql");
const roles = await read("integrations/postgres/bootstrap/roles.sql");
const workflow = await read(".github/workflows/ci.yml");
const packageJson = JSON.parse(await read("package.json"));

for (const required of [
  "authorizeIdentityMembership",
  "resolveDelegationChain",
  "VIRA_DELEGATION_MAX_DEPTH",
  "STALE_MEMBERSHIP",
  "DELEGATION_REVOKED",
  "DELEGATION_AUDIENCE_MISMATCH",
]) requireText(identityOwner, required, "identity owner");

for (const required of [
  "createPublicKey",
  "verifySignature",
  "RS256",
  "ES256",
  "EdDSA",
  "INVALID_SIGNATURE",
  "INVALID_AUDIENCE",
  "NONCE_MISMATCH",
]) requireText(oidc, required, "OIDC adapter");

for (const required of [
  "fetchOidcDiscoveryAndJwks",
  "VIRA_OIDC_MAX_METADATA_BYTES",
  "VIRA_OIDC_MAX_JWKS_BYTES",
  "VIRA_OIDC_MAX_JWKS_KEYS",
  "expectedJwksUri",
  'redirect: "error"',
  'cache: "no-store"',
  "OIDC_JWKS_URI_MISMATCH",
  "duplicate kid",
]) requireText(oidcDiscovery, required, "OIDC discovery adapter");

for (const required of [
  "__Host-vira_session",
  "HttpOnly",
  "Secure",
  "SameSite=Lax",
  "timingSafeEqual",
  "ORIGIN_MISMATCH",
  "CSRF_MISMATCH",
  "createCspHostRequirements",
  "same-origin-only",
  "authorizePersistedBrowserSession",
  "SESSION_REVOKED",
  "SESSION_EXPIRED",
  "STALE_MEMBERSHIP",
]) requireText(browser, required, "browser session adapter");

for (const required of [
  "authorizePersistedBrowserSessionHash",
  "sessionIdHash",
  "SESSION_REVOKED",
  "MEMBERSHIP_INACTIVE",
  "STALE_MEMBERSHIP",
]) requireText(persistedBrowser, required, "persisted browser authorization");

for (const required of [
  "VIRA_BFF_MAX_BODY_BYTES = 65_536",
  "VIRA_BFF_MAX_JSON_DEPTH = 32",
  "prepareBrowserBffRequest",
  "RATE_LIMIT_UNAVAILABLE",
  "RATE_LIMITED",
  "signBffServerRequest",
  "verifyBffServerRequest",
  "SERVER_REQUEST_EXPIRED",
  "sessionIdHash",
  "requestedScope",
]) requireText(bff, required, "BFF security boundary");

for (const required of [
  "authorizeBrowserSessionFromPostgres",
  "withTenantTransaction",
  "FROM vira.browser_session AS bs",
  "INNER JOIN vira.identity_membership AS im",
  "session_id_hash = $1",
  "authorizePersistedBrowserSessionHash",
]) requireText(postgresSession, required, "PostgreSQL browser-session adapter");

for (const required of [
  "handleViraApiBffIngress",
  "verifyBffServerRequest",
  "authorizeBrowserSessionFromPostgres",
  'input.path !== "/v1/bff/proxy"',
  "INVALID_BFF_ENVELOPE",
  "dependencies.dispatch",
]) requireText(railwayIngress, required, "Railway BFF ingress");

for (const required of [
  "handleViraWebBffRequest",
  "VIRA_BROWSER_SESSION_COOKIE",
  "prepareBrowserBffRequest",
  "VIRA_BFF_RATE_LIMIT_URL",
  "VIRA_BFF_RATE_LIMIT_TOKEN",
  "signBffServerRequest",
  'const ingressPath = "/v1/bff/proxy"',
  "x-vira-bff-signature",
  "VIRA_RAILWAY_API_ORIGIN",
]) requireText(vercelBff, required, "Vercel same-origin BFF");

for (const table of ["vira.identity_membership", "vira.delegation_grant", "vira.browser_session"]) {
  requireText(migration, table, "PROD-03 migration");
}
for (const required of ["ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY", "vira.scope_matches", "vira_identity", "revoked_at"]) {
  requireText(migration, required, "PROD-03 migration");
}
requireText(roles, "vira_identity", "database roles");

if (/(access_token|refresh_token|id_token|session_token)\s+(text|varchar|character varying|bytea)/i.test(migration)) {
  failures.push("PROD-03 migration: raw browser/OIDC token persistence is forbidden");
}
if (/localStorage|sessionStorage/.test(browser + vercelBff)) {
  failures.push("browser boundary: browser storage of authentication material is forbidden");
}
if (/\b(?:jku|x5u)\b/.test(oidc + oidcDiscovery)) {
  failures.push("OIDC boundary: token/key-controlled remote URL fields are forbidden");
}
if (/headers\.set\(["'](?:cookie|authorization)["']/i.test(vercelBff)) {
  failures.push("Vercel BFF: browser Cookie/Authorization must not be forwarded to Railway");
}
if (/sessionToken/.test(railwayIngress)) {
  failures.push("Railway BFF ingress: raw browser session token must not cross the Vercel boundary");
}
if (!packageJson.scripts?.["test:identity-delegation"]?.includes("oidc-discovery.test.ts")) {
  failures.push("package.json: OIDC discovery proof is not part of test:identity-delegation");
}
if (!packageJson.scripts?.["test:browser-security"]?.includes("vercel-bff.test.ts")) {
  failures.push("package.json: Vercel BFF host proof is not part of test:browser-security");
}
if (!packageJson.scripts?.["test:browser-security"]?.includes("bff-ingress.test.ts")) {
  failures.push("package.json: Railway BFF ingress proof is not part of test:browser-security");
}

for (const script of [
  "test:identity-delegation",
  "test:browser-security",
  "verify:identity-delegation:static",
  "verify:identity-delegation",
  "verify:browser-security",
]) {
  if (!packageJson.scripts?.[script]) failures.push(`package.json: missing ${script}`);
}
requireText(workflow, "Verify identity and browser security", "CI");
requireText(workflow, "pnpm verify:identity-delegation", "CI");

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("IDENTITY_DELEGATION_STATIC_OK\n");
}
