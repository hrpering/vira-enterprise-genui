import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredPaths = [
  "apps/vira-web/package.json",
  "apps/vira-web/build.mjs",
  "apps/vira-api/src/index.ts",
  "apps/vira-worker/src/index.ts",
  "integrations/README.md",
  "ops/docker/vira-api.Dockerfile",
  "ops/docker/vira-worker.Dockerfile",
  "ops/deploy/runtime-environment.ts",
  "ops/deploy/release-manifest.ts",
  "ops/runbooks/production-shell.md",
  "vercel.json",
  ".railway/railway.ts",
  ".railway/package.json",
  ".railway/package-lock.json",
];

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function requireAbsent(relativePath) {
  try {
    await access(path.join(root, relativePath));
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${relativePath} must not exist in the final production shell`);
}

function requireText(content, needle, label) {
  if (!content.includes(needle)) throw new Error(`${label} is missing required marker: ${needle}`);
}

await Promise.all(requiredPaths.map((relativePath) => access(path.join(root, relativePath))));
await Promise.all([
  requireAbsent(".github/workflows/prod-01-lockfile-bootstrap.yml"),
  requireAbsent("railway.json"),
  requireAbsent("railway.toml"),
]);

const [workspace, rootPackageText, pnpmLock, vercelText, railwayText, railwayPackageText, railwayLockText, apiPackageText, workerPackageText, webPackageText, webBuild, apiIndex, workerIndex, apiDocker, workerDocker, releaseManifest] = await Promise.all([
  read("pnpm-workspace.yaml"),
  read("package.json"),
  read("pnpm-lock.yaml"),
  read("vercel.json"),
  read(".railway/railway.ts"),
  read(".railway/package.json"),
  read(".railway/package-lock.json"),
  read("apps/vira-api/package.json"),
  read("apps/vira-worker/package.json"),
  read("apps/vira-web/package.json"),
  read("apps/vira-web/build.mjs"),
  read("apps/vira-api/src/index.ts"),
  read("apps/vira-worker/src/index.ts"),
  read("ops/docker/vira-api.Dockerfile"),
  read("ops/docker/vira-worker.Dockerfile"),
  read("ops/deploy/release-manifest.ts"),
]);

requireText(workspace, '- "apps/*"', "workspace");
for (const importer of ["apps/vira-web:", "apps/vira-api:", "apps/vira-worker:"]) requireText(pnpmLock, importer, "pnpm lockfile");

const rootPackage = JSON.parse(rootPackageText);
requireText(rootPackage.scripts.verify, "verify:production-shell", "root verify chain");
for (const marker of ["npm ci --prefix .railway --ignore-scripts", "npm --prefix .railway run validate"]) {
  requireText(rootPackage.scripts["verify:production-shell"], marker, "production-shell verify chain");
}

for (const [label, text] of [["vira-web", webPackageText], ["vira-api", apiPackageText], ["vira-worker", workerPackageText]]) {
  const manifest = JSON.parse(text);
  if (Object.keys(manifest.dependencies ?? {}).length > 0 || Object.keys(manifest.devDependencies ?? {}).length > 0) {
    throw new Error(`${label} shell must not acquire domain/runtime package dependencies in PROD-01`);
  }
}

if (apiIndex.includes("@vira-enterprise-genui/") || workerIndex.includes("@vira-enterprise-genui/")) {
  throw new Error("PROD-01 API/worker shells must not mount canonical domain packages");
}

const vercel = JSON.parse(vercelText);
if (vercel.outputDirectory !== "apps/vira-web/dist" || vercel.buildCommand !== "pnpm --filter @vira-enterprise-genui/vira-web build") {
  throw new Error("Vercel production-shell build contract drifted");
}
if (!Array.isArray(vercel.regions) || !vercel.regions.includes("fra1")) throw new Error("Vercel Frankfurt region freeze is missing");
for (const marker of ["VERCEL_TARGET_ENV", "VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA", "VERCEL_DEPLOYMENT_ID", 'value === "staging" || value === "preview"']) {
  requireText(webBuild, marker, "Vercel web build metadata");
}

for (const marker of ["defineRailway", "vira-api", "vira-worker", "europe-west4-drams3a", 'healthcheck: "/readyz"', "autoDeploy: false", "VIRA_RAILWAY_SOURCE_BRANCH", 'branch !== "main"', 'ctx.isEnvironment("development")', 'ctx.isEnvironment("staging")', 'ctx.isEnvironment("production")']) {
  requireText(railwayText, marker, "Railway IaC");
}
const railwayPackage = JSON.parse(railwayPackageText);
if (railwayPackage.dependencies?.railway !== "3.11.0") throw new Error("Railway IaC SDK must stay exact-pinned at 3.11.0 for PROD-01");
if (railwayPackage.scripts?.validate !== "node railway.ts") throw new Error("Railway IaC validation must execute the actual railway.ts program");
const railwayLock = JSON.parse(railwayLockText);
if (railwayLock.packages?.[""]?.dependencies?.railway !== "3.11.0") throw new Error("Railway IaC package-lock does not pin the expected SDK");

for (const marker of ["webDeploymentId", "apiDeploymentId", "workerDeploymentId", "RAILWAY_DEPLOYMENT_ID_PATTERN", "VERCEL_DEPLOYMENT_ID_PATTERN"]) {
  requireText(releaseManifest, marker, "release manifest");
}
for (const dockerfile of [apiDocker, workerDocker]) {
  requireText(dockerfile, "pnpm install --frozen-lockfile", "production Dockerfile");
  requireText(dockerfile, "USER node", "production Dockerfile");
}

console.log("PRODUCTION_SHELL_OK");
