import { createHash } from "node:crypto";

export const VIRA_FULL_PLATFORM_STAGES = Object.freeze([
  "publisher.authenticated", "application.public", "host.external", "supply.trusted",
  "run.cross-surface", "execution.protected", "ledger.verified", "acquisition.selected",
  "usage.priced", "settlement.allocated", "reconciliation.matched",
] as const);
export type ViraFullPlatformStage = typeof VIRA_FULL_PLATFORM_STAGES[number];
export type ViraFullPlatformFault = "none" | "upgrade-incompatible" | "revoked-publisher" | "revoked-host" | "revoked-supply" | "handoff-gap" | "load-failure" | "soak-failure" | "restore-mismatch";

export interface ViraFullPlatformEvidence {
  readonly stage: ViraFullPlatformStage;
  readonly evidenceRef: string;
  readonly applicationRef: string;
  readonly capabilityRef: string;
  readonly tenantRef: string;
  readonly outcome: "verified";
}

export interface ViraFullPlatformProofInput {
  readonly version: "1";
  readonly applicationRef: string;
  readonly capabilityRef: string;
  readonly tenantRef: string;
  readonly publisherRef: string;
  readonly externalHostRef: string;
  readonly initialDeviceRef: string;
  readonly continuationDeviceRef: string;
  readonly currentPlatformVersion: string;
  readonly minimumPlatformVersion: string;
  readonly maximumPlatformVersion: string;
  readonly currency: string;
  readonly amountNanos: string;
  readonly revokedRefs: readonly string[];
  readonly loadIterations: number;
  readonly soakDurationMs: number;
  readonly restoredSnapshotDigest: string;
  readonly expectedSnapshotDigest: string;
  readonly stages: readonly ViraFullPlatformEvidence[];
  readonly simulatedFault?: ViraFullPlatformFault;
}

export interface ViraFullPlatformProof {
  readonly version: "1";
  readonly status: "PROVISIONAL_CODE_COMPLETE";
  readonly liveReleaseGates: "OPEN";
  readonly releaseAuthority: "forbidden";
  readonly applicationRef: string;
  readonly capabilityRef: string;
  readonly tenantRef: string;
  readonly crossDeviceContinuation: "verified";
  readonly upgradeCompatibility: "verified";
  readonly loadSoak: "simulated-verified";
  readonly disasterRecovery: "simulated-verified";
  readonly evidence: readonly ViraFullPlatformEvidence[];
  readonly digest: string;
}

type Result = { readonly ok: true; readonly value: ViraFullPlatformProof } | { readonly ok: false; readonly issue: { readonly code: string; readonly message: string } };
const REF = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{2,255}$/;
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const NANOS = /^(0|[1-9][0-9]{0,18})$/;
function fail(code: string, message: string): Result { return { ok: false, issue: Object.freeze({ code, message }) }; }
function version(value: string): readonly number[] | null { const match = VERSION.exec(value); return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null; }
function compare(left: readonly number[], right: readonly number[]): number { for (let i = 0; i < 3; i += 1) { if (left[i] !== right[i]) return left[i]! - right[i]!; } return 0; }
function exact(value: unknown, allowed: readonly string[], required: readonly string[] = allowed): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key)) && required.every((key) => keys.includes(key));
}

export function proveViraFullPlatform(input: ViraFullPlatformProofInput): Result {
  const inputFields = ["version", "applicationRef", "capabilityRef", "tenantRef", "publisherRef", "externalHostRef", "initialDeviceRef", "continuationDeviceRef", "currentPlatformVersion", "minimumPlatformVersion", "maximumPlatformVersion", "currency", "amountNanos", "revokedRefs", "loadIterations", "soakDurationMs", "restoredSnapshotDigest", "expectedSnapshotDigest", "stages", "simulatedFault"];
  if (!exact(input, inputFields, inputFields.slice(0, -1)) || input.version !== "1" || ![input.applicationRef, input.capabilityRef, input.tenantRef, input.publisherRef, input.externalHostRef, input.initialDeviceRef, input.continuationDeviceRef].every((ref) => REF.test(ref))) return fail("INVALID_INPUT", "full-platform input and identities must be exact and bounded");
  if ((input.simulatedFault ?? "none") !== "none") return fail("SIMULATED_FAULT_REJECTED", `fail-closed: ${input.simulatedFault}`);
  const current = version(input.currentPlatformVersion); const minimum = version(input.minimumPlatformVersion); const maximum = version(input.maximumPlatformVersion);
  if (!current || !minimum || !maximum || compare(current, minimum) < 0 || compare(current, maximum) > 0) return fail("UPGRADE_INCOMPATIBLE", "current platform version is outside the explicit compatibility window");
  if (input.revokedRefs.some((ref) => [input.publisherRef, input.externalHostRef, input.applicationRef, input.capabilityRef].includes(ref))) return fail("REVOKED_IDENTITY", "a required publisher, host, Application or supply reference is revoked");
  if (input.initialDeviceRef === input.continuationDeviceRef) return fail("CROSS_DEVICE_HANDOFF_MISSING", "continuation must prove a distinct device handoff");
  if (!Number.isSafeInteger(input.loadIterations) || input.loadIterations < 1_000 || !Number.isSafeInteger(input.soakDurationMs) || input.soakDurationMs < 60_000) return fail("LOAD_SOAK_INCOMPLETE", "bounded simulated load and soak gates are incomplete");
  if (!DIGEST.test(input.expectedSnapshotDigest) || input.restoredSnapshotDigest !== input.expectedSnapshotDigest) return fail("RESTORE_MISMATCH", "simulated restore digest does not match the immutable snapshot");
  if (!/^[A-Z]{3}$/.test(input.currency) || !NANOS.test(input.amountNanos) || BigInt(input.amountNanos) > 9_223_372_036_854_775_807n) return fail("COMMERCIAL_EVIDENCE_INVALID", "currency and amount must be canonical and bounded");
  if (!Array.isArray(input.stages) || input.stages.length !== VIRA_FULL_PLATFORM_STAGES.length) return fail("INCOMPLETE_CHAIN", "every full-platform stage requires evidence");
  const evidence: ViraFullPlatformEvidence[] = [];
  for (let index = 0; index < VIRA_FULL_PLATFORM_STAGES.length; index += 1) {
    const stage = input.stages[index];
    if (!exact(stage, ["stage", "evidenceRef", "applicationRef", "capabilityRef", "tenantRef", "outcome"]) || stage.stage !== VIRA_FULL_PLATFORM_STAGES[index]) return fail("STAGE_ORDER_MISMATCH", "full-platform evidence shape or order drifted");
    if (stage.applicationRef !== input.applicationRef || stage.capabilityRef !== input.capabilityRef || stage.tenantRef !== input.tenantRef) return fail("EXACT_REFERENCE_MISMATCH", "Application, Capability or tenant reference drifted");
    if (!REF.test(stage.evidenceRef) || stage.outcome !== "verified" || evidence.some((entry) => entry.evidenceRef === stage.evidenceRef)) return fail("UNVERIFIED_EVIDENCE", "stage evidence must be unique, exact and verified");
    evidence.push(Object.freeze({ ...stage }));
  }
  const canonical = JSON.stringify({ applicationRef: input.applicationRef, capabilityRef: input.capabilityRef, currency: input.currency, evidence, tenantRef: input.tenantRef, version: "1" });
  return { ok: true, value: Object.freeze({ version: "1", status: "PROVISIONAL_CODE_COMPLETE", liveReleaseGates: "OPEN", releaseAuthority: "forbidden", applicationRef: input.applicationRef, capabilityRef: input.capabilityRef, tenantRef: input.tenantRef, crossDeviceContinuation: "verified", upgradeCompatibility: "verified", loadSoak: "simulated-verified", disasterRecovery: "simulated-verified", evidence: Object.freeze(evidence), digest: `sha256:${createHash("sha256").update(canonical).digest("hex")}` }) };
}
