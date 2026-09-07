import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const requireText = (content, marker, label) => {
  if (!content.includes(marker)) throw new Error(`${label} is missing required marker: ${marker}`);
};

const [app, api, styles, manifest, browserTests, data] = await Promise.all([
  read("apps/vira-web/src/App.tsx"), read("apps/vira-web/src/api.ts"), read("apps/vira-web/src/styles.css"),
  read("apps/vira-web/package.json"), read("apps/vira-web/tests/control-center.spec.ts"), read("apps/vira-web/src/data.ts"),
]);

for (const surface of ["Chat", "Applications", "Runs", "Artifacts", "Tasks", "Approvals", "Waiting", "Needs attention", "Audit", "Usage & billing", "Studio", "Flow", "Integrations", "Connections", "Publish & releases", "Health", "Diagnostics", "Recovery"]) requireText(data, surface, "PROD-15 surface registry");
for (const state of ["loading", "empty", "partial", "error", "uncertain", "degraded", "offline", "reconnecting"]) requireText(app, `${state}:`, "PROD-15 resilient UI states");
for (const marker of ["@radix-ui/react-dialog", "@radix-ui/react-tabs", '"react"', '"vite"']) requireText(manifest, marker, "PROD-15 web manifest");
for (const marker of ["prefers-reduced-motion", "prefers-color-scheme: light", "evidence-flow", "@media (max-width: 820px)"]) requireText(styles, marker, "PROD-15 responsive styles");
for (const marker of ["@axe-core/playwright", "setOffline", "reducedMotion", "colorScheme", "Open navigation", "Preview role"]) requireText(browserTests, marker, "PROD-15 browser gate");
for (const marker of ["/api/bff", "x-vira-target-path", "x-vira-organization-id", "x-vira-project-id", "x-vira-environment", "cache: \"no-store\""]) requireText(api, marker, "PROD-15 thin BFF adapter");
if (app.includes("@vira-enterprise-genui/") || api.includes("@vira-enterprise-genui/")) throw new Error("apps/vira-web must not acquire semantic authority imports");
const styleBytes = (await stat(path.join(root, "apps/vira-web/src/styles.css"))).size;
if (styleBytes > 57_344) throw new Error(`PROD-15 owned web CSS exceeds 57,344 bytes: ${styleBytes}`);
console.log(`PROD15_WEB_OK css_bytes=${styleBytes}`);
