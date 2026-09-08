import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function requireText(content, needle, label) {
  if (!content.includes(needle)) {
    throw new Error(`${label} is missing required marker: ${needle}`);
  }
}

const [
  masterPlan,
  activePhase,
  productionPlan,
  prod00,
  prod01,
  prod20,
  ownerMatrix,
  referenceApplication,
  vendorAdr,
  securityAdr,
  sloAdr,
  releaseAdr,
  q2Freeze,
  packageManifest,
  productionIndex,
  liveBlockers,
  rootReadme,
] = await Promise.all([
  read("MASTER_PLAN.md"),
  read("docs/pr-plans/ACTIVE_PHASE.md"),
  read("docs/production/VIRA_UNIFIED_ARCHITECTURE_PRODUCTION_PLAN_FINAL.md"),
  read("docs/pr-plans/PROD-00.md"),
  read("docs/pr-plans/PROD-01.md"),
  read("docs/pr-plans/PROD-20.md"),
  read("docs/production/PROD_OWNER_MATRIX.md"),
  read("docs/production/REFERENCE_APPLICATION.md"),
  read("docs/production/adr/PROD-00-001-platform-vendors-regions.md"),
  read("docs/production/adr/PROD-00-002-security-data-and-retention.md"),
  read("docs/production/adr/PROD-00-003-slo-dr-incident-support.md"),
  read("docs/production/adr/PROD-00-004-release-versioning-migration.md"),
  read("docs/evidence/PROD-00/Q2_FREEZE.md"),
  read("package.json"),
  read("docs/production/README.md"),
  read("docs/production/LIVE_GATE_BLOCKERS.md"),
  read("README.md"),
]);

requireText(masterPlan, "PROD-00", "MASTER_PLAN.md");
requireText(masterPlan, "PROD-17", "MASTER_PLAN.md");
requireText(masterPlan, "PROD-22", "MASTER_PLAN.md");
requireText(
  activePhase,
  "docs/production/VIRA_UNIFIED_ARCHITECTURE_PRODUCTION_PLAN_FINAL.md",
  "ACTIVE_PHASE.md roadmap",
);

requireText(activePhase, "**Phase:** NONE", "ACTIVE_PHASE.md closure state");
requireText(activePhase, "PR #252 / `main@25eaaf6`", "ACTIVE_PHASE.md closure identity");
if (/\*\*Branch:\*\*\s+`prod\//.test(activePhase)) {
  throw new Error("ACTIVE_PHASE.md must not present a closed implementation branch as active");
}
requireText(productionPlan, "## PROD-00 — Program, owner, threat ve operasyon freeze", "production plan");
requireText(productionPlan, "## PROD-01 — Production workspace ve deploy edilebilir shell", "production plan");
requireText(productionPlan, "## PROD-20", "production plan");
requireText(prod00, "Q9", "PROD-00 plan");
requireText(prod01, "Q9", "PROD-01 plan");
requireText(prod20, "PR #214", "PROD-20 deferred plan");
requireText(ownerMatrix, "packages/application-deployment/", "production owner matrix");
requireText(referenceApplication, "Governed Employee Offboarding", "reference Application");
requireText(referenceApplication, "GitHub", "reference Application");
requireText(referenceApplication, "Google Workspace", "reference Application");
requireText(vendorAdr, "Vercel", "vendor ADR");
requireText(vendorAdr, "Railway", "vendor ADR");
requireText(vendorAdr, "Auth0", "vendor ADR");
requireText(vendorAdr, "AWS KMS", "vendor ADR");
requireText(vendorAdr, "Grafana Cloud", "vendor ADR");
requireText(securityAdr, "RESTRICTED", "security/data ADR");
requireText(sloAdr, "RPO", "SLO/DR ADR");
requireText(sloAdr, "RTO", "SLO/DR ADR");
requireText(releaseAdr, "Exact semantic references", "release ADR exact-ref policy");
requireText(q2Freeze, "**PASS.**", "Q2 freeze evidence");

if (/\*\*Phase:\*\*\s+MASTER-52/.test(activePhase)) {
  throw new Error("legacy MASTER-52 roadmap must not be the active phase");
}

for (const [content, label] of [
  [masterPlan, "MASTER_PLAN.md"],
  [activePhase, "ACTIVE_PHASE.md"],
  [productionIndex, "production README"],
  [rootReadme, "root README"],
]) {
  requireText(content, "PROVISIONAL CODE-COMPLETE", label);
  requireText(content, "LIVE RELEASE GATES OPEN", label);
}

if (/\| Production Platform \| PROD-00 \| ACTIVE|\| Full Platform cut-line \| PROD-22 \| PLANNED/.test(masterPlan)) {
  throw new Error("MASTER_PLAN.md still contains a pre-closure production status");
}

for (const marker of ["Vercel", "Railway", "backup/restore", "design-partner UAT", "load/soak", "Protect `main`"]) {
  requireText(liveBlockers, marker, "LIVE_GATE_BLOCKERS.md");
}

const manifest = JSON.parse(packageManifest);
const requiredRepositoryGates = [
  "verify:renderer-budget",
  "verify:webhook-replay",
  "verify:production-ui",
  "verify:operations-e2e",
  "verify:security-adversarial",
  "verify:external-host-identity",
  "verify:network-operational",
  "verify:protocol-conformance",
  "verify:provider-routing",
];
for (const gate of requiredRepositoryGates) {
  if (typeof manifest.scripts?.[gate] !== "string" || manifest.scripts[gate].length === 0) {
    throw new Error(`package.json is missing repository verification gate: ${gate}`);
  }
  requireText(productionPlan, gate, "production plan verification surface");
}

for (const liveGate of ["verify:backup-restore:live", "verify:production-deploy:live", "verify:load-soak:live"]) {
  requireText(productionPlan, liveGate, "production plan live verification surface");
  if (manifest.scripts?.[liveGate]) {
    throw new Error(`${liveGate} must not be exposed before real environment automation exists`);
  }
}

async function verifyLocalMarkdownLinks(relativeFile, content) {
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#", 1)[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    const resolved = path.resolve(root, path.dirname(relativeFile), decodeURIComponent(target));
    try {
      await access(resolved);
    } catch {
      throw new Error(`${relativeFile} contains a broken local link: ${match[1]}`);
    }
  }
}

await Promise.all([
  verifyLocalMarkdownLinks("README.md", rootReadme),
  verifyLocalMarkdownLinks("MASTER_PLAN.md", masterPlan),
  verifyLocalMarkdownLinks("docs/production/README.md", productionIndex),
]);

console.log("PLAN_COHERENCE_OK");
