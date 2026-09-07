import { createHash } from "node:crypto";

export const VIRA_PRODUCTION_MVP_STAGES = Object.freeze([
  "github.query", "google.query", "durable.wait-handoff", "github.write", "google.write",
  "transaction.protected", "postcondition.verified", "action-ledger.anchored", "billing-export.sealed",
] as const);
export type ViraProductionMvpStageKind = typeof VIRA_PRODUCTION_MVP_STAGES[number];
export type ViraProductionMvpFault = "none" | "restart-gap" | "duplicate-delivery" | "toctou" | "partial" | "mismatch" | "uncertain" | "rollback-gap" | "restore-gap";

export interface ViraProductionMvpStageEvidence {
  readonly kind: ViraProductionMvpStageKind;
  readonly applicationRef: string;
  readonly tenantRef: string;
  readonly evidenceRef: string;
  readonly outcome: "verified";
  readonly revision: number;
}

export interface ViraProductionMvpProof {
  readonly version: "1";
  readonly status: "PROVISIONAL_CODE_COMPLETE";
  readonly releaseAuthority: "forbidden";
  readonly applicationRef: string;
  readonly tenantRef: string;
  readonly stages: readonly ViraProductionMvpStageEvidence[];
  readonly proofSha256: string;
}

type Result = { readonly ok: true; readonly value: ViraProductionMvpProof } | { readonly ok: false; readonly issue: { readonly code: string; readonly message: string } };
const REF = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/;
function fail(code: string, message: string): Result { return { ok: false, issue: Object.freeze({ code, message }) }; }

export function proveProductionMvp(input: { applicationRef: string; tenantRef: string; stages: readonly ViraProductionMvpStageEvidence[]; simulatedFault?: ViraProductionMvpFault }): Result {
  if (!input || !REF.test(input.applicationRef) || !REF.test(input.tenantRef) || !Array.isArray(input.stages)) return fail("INVALID_INPUT", "production MVP proof input is invalid");
  if ((input.simulatedFault ?? "none") !== "none") return fail("SIMULATED_FAULT_REJECTED", `fail-closed: ${input.simulatedFault}`);
  if (input.stages.length !== VIRA_PRODUCTION_MVP_STAGES.length) return fail("INCOMPLETE_CHAIN", "every production MVP stage must have exact evidence");
  const stages: ViraProductionMvpStageEvidence[] = [];
  for (let index = 0; index < VIRA_PRODUCTION_MVP_STAGES.length; index += 1) {
    const stage = input.stages[index];
    if (!stage || stage.kind !== VIRA_PRODUCTION_MVP_STAGES[index]) return fail("STAGE_ORDER_MISMATCH", "production MVP stage order or identity drifted");
    if (stage.applicationRef !== input.applicationRef || stage.tenantRef !== input.tenantRef) return fail("EXACT_REFERENCE_MISMATCH", "stage evidence crossed application or tenant scope");
    if (!REF.test(stage.evidenceRef) || stage.outcome !== "verified" || !Number.isSafeInteger(stage.revision) || stage.revision < 1) return fail("UNVERIFIED_STAGE", "stage evidence is not exact and verified");
    if (stages.some((existing) => existing.evidenceRef === stage.evidenceRef)) return fail("DUPLICATE_EVIDENCE", "stage evidence references must be unique");
    stages.push(Object.freeze({ ...stage }));
  }
  const canonical = JSON.stringify({ applicationRef: input.applicationRef, stages, tenantRef: input.tenantRef, version: "1" });
  return { ok: true, value: Object.freeze({ version: "1", status: "PROVISIONAL_CODE_COMPLETE", releaseAuthority: "forbidden", applicationRef: input.applicationRef, tenantRef: input.tenantRef, stages: Object.freeze(stages), proofSha256: createHash("sha256").update(canonical).digest("hex") }) };
}
