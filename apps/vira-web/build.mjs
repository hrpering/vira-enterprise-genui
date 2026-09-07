import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");

function resolveEnvironment(env) {
  const value = env.VERCEL_TARGET_ENV ?? env.VERCEL_ENV ?? env.VIRA_ENVIRONMENT ?? "development";
  if (value === "production") return "production";
  if (value === "staging" || value === "preview") return "staging";
  if (value === "development") return "development";
  throw new Error("web environment must resolve to development, staging or production");
}

const environment = resolveEnvironment(process.env);
const buildSha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VIRA_BUILD_SHA ?? "local";
const releaseId = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VIRA_RELEASE_ID ?? buildSha;

if (environment === "production" && buildSha === "local") {
  throw new Error("production web build requires immutable build SHA metadata");
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all([
  copyFile(path.join(root, "index.html"), path.join(dist, "index.html")),
  copyFile(path.join(root, "app.js"), path.join(dist, "app.js")),
  copyFile(path.join(root, "styles.css"), path.join(dist, "styles.css")),
]);
await writeFile(
  path.join(dist, "build.json"),
  `${JSON.stringify({ version: "1", service: "vira-web", environment, buildSha, releaseId })}\n`,
  "utf8",
);

console.log(`VIRA_WEB_BUILD_OK ${environment} ${buildSha} ${releaseId}`);
