#!/usr/bin/env node

const REQUIRED_MANIFEST_KEYS = [
  "apiDeploymentId",
  "buildSha",
  "environment",
  "releaseId",
  "version",
  "webDeploymentId",
  "webDeploymentUrl",
  "workerDeploymentId",
];
const SHA_PATTERN = /^[a-f0-9]{7,64}$/i;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const VERCEL_DEPLOYMENT_ID_PATTERN = /^dpl_[A-Za-z0-9]{8,128}$/;
const RAILWAY_DEPLOYMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_TARGET_PATH = /^\/v1\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,1000}$/;

function fail(message, detail = {}) {
  const output = {
    version: "1",
    gate: "live-deployment-evidence",
    authority: "live-http",
    closureEligible: false,
    message,
    ...detail,
  };
  process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(1);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
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

function parseManifest(raw) {
  const value = parseJson(raw, "VIRA_RELEASE_MANIFEST_JSON");
  if (!isRecord(value)) fail("release manifest must be an object");
  const keys = Object.keys(value).sort();
  if (keys.length !== REQUIRED_MANIFEST_KEYS.length || keys.some((key, index) => key !== REQUIRED_MANIFEST_KEYS[index])) {
    fail("release manifest contains missing or unknown fields", { keysObserved: keys });
  }
  if (value.version !== "1") fail("release manifest version must be 1");

  const environment = requiredString(value, "environment", "manifest");
  if (environment !== "staging" && environment !== "production") fail("release environment must be staging or production");
  const buildSha = requiredString(value, "buildSha", "manifest");
  if (!SHA_PATTERN.test(buildSha)) fail("release buildSha must be hexadecimal");
  const releaseId = requiredString(value, "releaseId", "manifest");
  if (!RELEASE_ID_PATTERN.test(releaseId)) fail("releaseId is invalid");

  const webDeploymentId = requiredString(value, "webDeploymentId", "manifest");
  if (!VERCEL_DEPLOYMENT_ID_PATTERN.test(webDeploymentId)) fail("webDeploymentId must be an exact Vercel deployment ID");
  const webDeploymentUrl = requiredString(value, "webDeploymentUrl", "manifest");
  let webUrl;
  try {
    webUrl = new globalThis.URL(webDeploymentUrl);
  } catch {
    fail("webDeploymentUrl must be a valid URL");
  }
  if (webUrl.protocol !== "https:" || !webUrl.hostname.endsWith(".vercel.app") || webUrl.username !== "" || webUrl.password !== "") {
    fail("webDeploymentUrl must be an HTTPS Vercel deployment URL");
  }

  const apiDeploymentId = requiredString(value, "apiDeploymentId", "manifest");
  const workerDeploymentId = requiredString(value, "workerDeploymentId", "manifest");
  if (!RAILWAY_DEPLOYMENT_ID_PATTERN.test(apiDeploymentId) || !RAILWAY_DEPLOYMENT_ID_PATTERN.test(workerDeploymentId)) {
    fail("API and worker deployment IDs must be exact Railway deployment UUIDs");
  }
  if (apiDeploymentId.toLowerCase() === workerDeploymentId.toLowerCase()) fail("API and worker must record independent Railway deployments");

  return Object.freeze({
    version: "1",
    environment,
    buildSha: buildSha.toLowerCase(),
    releaseId,
    webDeploymentId,
    webDeploymentUrl: webUrl.origin,
    apiDeploymentId: apiDeploymentId.toLowerCase(),
    workerDeploymentId: workerDeploymentId.toLowerCase(),
  });
}

function httpsOrigin(name) {
  const raw = requiredEnv(name);
  let url;
  try {
    url = new globalThis.URL(raw);
  } catch {
    fail(`${name} must be a valid URL`);
  }
  if (
    url.protocol !== "https:"
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== ""
    || url.username !== ""
    || url.password !== ""
  ) fail(`${name} must be a credential-free HTTPS origin`);
  return url.origin;
}

function vercelHeaders() {
  const bypass = process.env.VIRA_VERCEL_PROTECTION_BYPASS?.trim();
  return bypass ? { "x-vercel-protection-bypass": bypass } : {};
}

async function request(url, init, label) {
  let response;
  try {
    response = await globalThis.fetch(url, { redirect: "error", ...init });
  } catch (error) {
    fail(`${label} network request failed`, { url, error: error instanceof Error ? error.message : "unknown" });
  }
  return response;
}

async function getJson(url, label, headers = {}) {
  const response = await request(url, { method: "GET", headers }, label);
  const text = await response.text();
  let body;
  try {
    body = text === "" ? null : JSON.parse(text);
  } catch {
    fail(`${label} did not return JSON`, { url, httpStatus: response.status });
  }
  if (!response.ok) fail(`${label} returned a non-success status`, { url, httpStatus: response.status, body });
  if (!isRecord(body)) fail(`${label} JSON body must be an object`, { url });
  return body;
}

function assertIdentity(body, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    if (body[key] !== value) fail(`${label} identity mismatch`, { field: key, expected: value, observed: body[key] });
  }
}

async function verifyService(origin, service, deploymentId, manifest) {
  const ready = await getJson(`${origin}/readyz`, `${service} readiness`);
  assertIdentity(ready, { status: "ready", service, environment: manifest.environment }, `${service} readiness`);

  const build = await getJson(`${origin}/build`, `${service} build identity`);
  assertIdentity(build, {
    version: "1",
    service,
    environment: manifest.environment,
    buildSha: manifest.buildSha,
    releaseId: deploymentId,
  }, `${service} build identity`);
}

function parseBffProbe(raw, manifest) {
  const value = parseJson(raw, "VIRA_DEPLOYMENT_BFF_PROBE_JSON");
  if (!isRecord(value)) fail("BFF probe must be an object");
  const origin = requiredString(value, "origin", "bffProbe");
  let parsedOrigin;
  try {
    parsedOrigin = new globalThis.URL(origin);
  } catch {
    fail("bffProbe.origin must be a valid URL");
  }
  if (parsedOrigin.protocol !== "https:" || parsedOrigin.origin !== origin) fail("bffProbe.origin must be a credential-free HTTPS origin");
  const cookie = requiredString(value, "cookie", "bffProbe");
  const csrfToken = requiredString(value, "csrfToken", "bffProbe");
  const targetPath = requiredString(value, "targetPath", "bffProbe");
  if (!SAFE_TARGET_PATH.test(targetPath)) fail("bffProbe.targetPath must be a bounded /v1 path");
  const organizationId = requiredString(value, "organizationId", "bffProbe");
  const projectId = requiredString(value, "projectId", "bffProbe");
  const targetEnvironment = requiredString(value, "environment", "bffProbe");
  if (targetEnvironment !== manifest.environment) fail("bffProbe.environment must match release manifest environment");
  const expectedStatus = value.expectedStatus === undefined ? 200 : value.expectedStatus;
  if (!Number.isInteger(expectedStatus) || expectedStatus < 200 || expectedStatus > 299) fail("bffProbe.expectedStatus must be a 2xx integer");
  const body = value.body === undefined ? {} : value.body;
  return Object.freeze({ origin, cookie, csrfToken, targetPath, organizationId, projectId, targetEnvironment, expectedStatus, body });
}

function bffHeaders(probe, includeCookie = true, includeCsrf = true) {
  return {
    ...vercelHeaders(),
    origin: probe.origin,
    "sec-fetch-site": "same-origin",
    "content-type": "application/json; charset=utf-8",
    "x-vira-target-path": probe.targetPath,
    "x-vira-organization-id": probe.organizationId,
    "x-vira-project-id": probe.projectId,
    "x-vira-environment": probe.targetEnvironment,
    ...(includeCookie ? { cookie: probe.cookie } : {}),
    ...(includeCsrf ? { "x-vira-csrf": probe.csrfToken } : {}),
  };
}

async function verifyBffChain(webOrigin, apiOrigin, probe) {
  const body = JSON.stringify(probe.body);
  const positive = await request(`${webOrigin}/api/bff`, {
    method: "POST",
    headers: bffHeaders(probe),
    body,
  }, "deployed BFF positive probe");
  if (positive.status !== probe.expectedStatus) {
    fail("deployed BFF positive probe did not traverse the expected chain", { expectedStatus: probe.expectedStatus, observedStatus: positive.status });
  }

  const noCsrf = await request(`${webOrigin}/api/bff`, {
    method: "POST",
    headers: bffHeaders(probe, true, false),
    body,
  }, "deployed BFF CSRF-negative probe");
  if (noCsrf.status !== 403) fail("deployed BFF did not reject a missing CSRF token", { expectedStatus: 403, observedStatus: noCsrf.status });

  const noSession = await request(`${webOrigin}/api/bff`, {
    method: "POST",
    headers: bffHeaders(probe, false, true),
    body,
  }, "deployed BFF session-negative probe");
  if (noSession.status !== 401) fail("deployed BFF did not reject a missing session", { expectedStatus: 401, observedStatus: noSession.status });

  const unsignedIngress = await request(`${apiOrigin}/v1/bff/proxy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }, "Railway unsigned-ingress negative probe");
  if (![400, 401, 403].includes(unsignedIngress.status)) {
    fail("Railway BFF ingress did not fail closed for an unsigned direct request", { observedStatus: unsignedIngress.status });
  }
}

const manifest = parseManifest(requiredEnv("VIRA_RELEASE_MANIFEST_JSON"));
const apiOrigin = httpsOrigin("VIRA_RAILWAY_API_ORIGIN");
const workerOrigin = httpsOrigin("VIRA_RAILWAY_WORKER_ORIGIN");
const bffProbe = parseBffProbe(requiredEnv("VIRA_DEPLOYMENT_BFF_PROBE_JSON"), manifest);

const webBuild = await getJson(`${manifest.webDeploymentUrl}/build.json`, "Vercel web build identity", vercelHeaders());
assertIdentity(webBuild, {
  version: "1",
  service: "vira-web",
  environment: manifest.environment,
  buildSha: manifest.buildSha,
  releaseId: manifest.webDeploymentId,
}, "Vercel web build identity");

await verifyService(apiOrigin, "vira-api", manifest.apiDeploymentId, manifest);
await verifyService(workerOrigin, "vira-worker", manifest.workerDeploymentId, manifest);
await verifyBffChain(manifest.webDeploymentUrl, apiOrigin, bffProbe);

process.stdout.write(`${JSON.stringify({
  version: "1",
  gate: "live-deployment-evidence",
  authority: "live-http",
  environment: manifest.environment,
  buildSha: manifest.buildSha,
  releaseId: manifest.releaseId,
  deployments: {
    web: { id: manifest.webDeploymentId, url: manifest.webDeploymentUrl },
    api: { id: manifest.apiDeploymentId, origin: apiOrigin },
    worker: { id: manifest.workerDeploymentId, origin: workerOrigin },
  },
  proofs: {
    exactDeploymentIdentity: true,
    readiness: true,
    browserSessionBoundary: true,
    csrfNegative: true,
    signedServerBoundary: true,
    unsignedIngressNegative: true,
  },
  observedAt: new globalThis.Date().toISOString(),
  closureEligible: true,
}, null, 2)}\n`);
