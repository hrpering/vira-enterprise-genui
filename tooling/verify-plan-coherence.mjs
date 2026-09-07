import { readFile } from "node:fs/promises";
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
  prod20,
  ownerMatrix,
  referenceApplication,
  vendorAdr,
  securityAdr,
  sloAdr,
  releaseAdr,
  q2Freeze,
] = await Promise.all([
  read("MASTER_PLAN.md"),
  read("docs/pr-plans/ACTIVE_PHASE.md"),
  read("docs/production/VIRA_UNIFIED_ARCHITECTURE_PRODUCTION_PLAN_FINAL.md"),
  read("docs/pr-plans/PROD-00.md"),
  read("docs/pr-plans/PROD-20.md"),
  read("docs/production/PROD_OWNER_MATRIX.md"),
  read("docs/production/REFERENCE_APPLICATION.md"),
  read("docs/production/adr/PROD-00-001-platform-vendors-regions.md"),
  read("docs/production/adr/PROD-00-002-security-data-and-retention.md"),
  read("docs/production/adr/PROD-00-003-slo-dr-incident-support.md"),
  read("docs/production/adr/PROD-00-004-release-versioning-migration.md"),
  read("docs/evidence/PROD-00/Q2_FREEZE.md"),
]);

requireText(masterPlan, "PROD-00", "MASTER_PLAN.md");
requireText(masterPlan, "PROD-17", "MASTER_PLAN.md");
requireText(masterPlan, "PROD-22", "MASTER_PLAN.md");
requireText(activePhase, "PROD-00", "ACTIVE_PHASE.md");
requireText(activePhase, "prod/00-program-freeze", "ACTIVE_PHASE.md");
requireText(productionPlan, "PROD-00 — Program, owner, threat ve operasyon freeze", "production plan");
requireText(productionPlan, "PROD-20 — Machine Commerce ve dynamic acquisition", "production plan");
requireText(prod00, "Q0", "PROD-00 plan");
requireText(prod00, "Q9", "PROD-00 plan");
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

console.log("PLAN_COHERENCE_OK");
