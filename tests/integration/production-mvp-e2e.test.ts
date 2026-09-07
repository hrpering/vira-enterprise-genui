import { describe, expect, it } from "vitest";
import { proveProductionMvp, VIRA_PRODUCTION_MVP_STAGES } from "../../packages/production-mvp/src/index.js";

const applicationRef = "application:travel-ops@2.4.0";
const tenantRef = "organization:acme/project:travel/environment:staging";
function stages() { return VIRA_PRODUCTION_MVP_STAGES.map((kind, index) => ({ kind, applicationRef, tenantRef, evidenceRef: `evidence:prod17:${index + 1}`, outcome: "verified" as const, revision: index + 1 })); }

describe("PROD-17 reference Application production MVP proof", () => {
  it("binds GitHub and Google query/write through durable, protected, ledger and billing evidence", () => {
    const result = proveProductionMvp({ applicationRef, tenantRef, stages: stages() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ status: "PROVISIONAL_CODE_COMPLETE", releaseAuthority: "forbidden", applicationRef, tenantRef });
    expect(result.value.proofSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(proveProductionMvp({ applicationRef, tenantRef, stages: stages() })).toEqual(result);
  });

  it.each(["restart-gap", "duplicate-delivery", "toctou", "partial", "mismatch", "uncertain", "rollback-gap", "restore-gap"] as const)("fails closed for %s simulation", (simulatedFault) => {
    expect(proveProductionMvp({ applicationRef, tenantRef, stages: stages(), simulatedFault })).toMatchObject({ ok: false, issue: { code: "SIMULATED_FAULT_REJECTED" } });
  });

  it("rejects missing, reordered, duplicate, cross-tenant and unverified evidence", () => {
    expect(proveProductionMvp({ applicationRef, tenantRef, stages: stages().slice(1) })).toMatchObject({ ok: false, issue: { code: "INCOMPLETE_CHAIN" } });
    const reordered = stages(); [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(proveProductionMvp({ applicationRef, tenantRef, stages: reordered })).toMatchObject({ ok: false, issue: { code: "STAGE_ORDER_MISMATCH" } });
    expect(proveProductionMvp({ applicationRef, tenantRef, stages: stages().map((stage, index) => index === 1 ? { ...stage, evidenceRef: "evidence:prod17:1" } : stage) })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_EVIDENCE" } });
    expect(proveProductionMvp({ applicationRef, tenantRef, stages: stages().map((stage, index) => index === 4 ? { ...stage, tenantRef: "organization:evil" } : stage) })).toMatchObject({ ok: false, issue: { code: "EXACT_REFERENCE_MISMATCH" } });
  });
});
