export const VIRA_CROSS_SURFACE_CONTINUITY_VERSION = "1" as const;
export const VIRA_CONTINUITY_SURFACES = Object.freeze(["web", "ios", "android", "external-ai-host"] as const);
export const VIRA_CONTINUITY_CONNECTIVITY = Object.freeze(["online", "offline", "reconnected"] as const);

export type ViraContinuitySurface = (typeof VIRA_CONTINUITY_SURFACES)[number];
export type ViraContinuityConnectivity = (typeof VIRA_CONTINUITY_CONNECTIVITY)[number];

export interface ViraContinuityRevisionRef {
  readonly id: string;
  readonly revision: number;
}

export interface ViraContinuityApprovalRef {
  readonly id: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly decision: "approved" | "rejected";
}

export interface ViraContinuityArtifactRef {
  readonly id: string;
  readonly revision: number;
  readonly digest: string;
}

export interface ViraCrossSurfaceAuthoritySnapshot {
  readonly applicationReleaseRef: string;
  readonly scopeRef: string;
  readonly run: ViraContinuityRevisionRef;
  readonly task: ViraContinuityRevisionRef | null;
  readonly approval: ViraContinuityApprovalRef | null;
  readonly artifact: ViraContinuityArtifactRef | null;
}

export interface ViraCrossSurfaceObservation {
  readonly version: typeof VIRA_CROSS_SURFACE_CONTINUITY_VERSION;
  readonly surface: ViraContinuitySurface;
  readonly connectivity: ViraContinuityConnectivity;
  readonly state: ViraCrossSurfaceAuthoritySnapshot;
}

export interface ViraCrossSurfaceMismatch {
  readonly surface: ViraContinuitySurface;
  readonly path: string;
  readonly message: string;
}

export interface ViraCrossSurfaceObservationResult {
  readonly surface: ViraContinuitySurface;
  readonly connectivity: ViraContinuityConnectivity;
  readonly synchronized: boolean;
  readonly mismatches: readonly ViraCrossSurfaceMismatch[];
}

export interface ViraCrossSurfaceContinuityReport {
  readonly version: typeof VIRA_CROSS_SURFACE_CONTINUITY_VERSION;
  readonly fixtureId: string;
  readonly conformant: boolean;
  readonly observations: readonly ViraCrossSurfaceObservationResult[];
}

export type ViraCrossSurfaceContinuityIssueCode =
  | "INVALID_INPUT"
  | "INVALID_AUTHORITY"
  | "INVALID_OBSERVATION"
  | "DUPLICATE_SURFACE";

export interface ViraCrossSurfaceContinuityIssue {
  readonly code: ViraCrossSurfaceContinuityIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCrossSurfaceContinuityResult =
  | { readonly ok: true; readonly value: ViraCrossSurfaceContinuityReport }
  | { readonly ok: false; readonly issue: ViraCrossSurfaceContinuityIssue };

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const opaqueRefPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/+%-]{0,511}$/;
const sha256Pattern = /^(?:sha256:)?[0-9a-f]{64}$/;
const authorityKeys = Object.freeze(["applicationReleaseRef", "scopeRef", "run", "task", "approval", "artifact"] as const);
const revisionKeys = Object.freeze(["id", "revision"] as const);
const approvalKeys = Object.freeze(["id", "planDigest", "planRevision", "decision"] as const);
const artifactKeys = Object.freeze(["id", "revision", "digest"] as const);
const observationKeys = Object.freeze(["version", "surface", "connectivity", "state"] as const);

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function issue(code: ViraCrossSurfaceContinuityIssueCode, path: string, message: string): ViraCrossSurfaceContinuityResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function revisionRef(value: unknown): value is ViraContinuityRevisionRef {
  return plain(value)
    && exactKeys(value, revisionKeys)
    && typeof value.id === "string"
    && idPattern.test(value.id)
    && Number.isSafeInteger(value.revision)
    && (value.revision as number) >= 1;
}

function approvalRef(value: unknown): value is ViraContinuityApprovalRef {
  return plain(value)
    && exactKeys(value, approvalKeys)
    && typeof value.id === "string"
    && idPattern.test(value.id)
    && typeof value.planDigest === "string"
    && sha256Pattern.test(value.planDigest)
    && Number.isSafeInteger(value.planRevision)
    && (value.planRevision as number) >= 1
    && (value.decision === "approved" || value.decision === "rejected");
}

function artifactRef(value: unknown): value is ViraContinuityArtifactRef {
  return plain(value)
    && exactKeys(value, artifactKeys)
    && typeof value.id === "string"
    && idPattern.test(value.id)
    && Number.isSafeInteger(value.revision)
    && (value.revision as number) >= 1
    && typeof value.digest === "string"
    && /^sha256:[0-9a-f]{64}$/.test(value.digest);
}

function authoritySnapshot(value: unknown): value is ViraCrossSurfaceAuthoritySnapshot {
  return plain(value)
    && exactKeys(value, authorityKeys)
    && typeof value.applicationReleaseRef === "string"
    && opaqueRefPattern.test(value.applicationReleaseRef)
    && typeof value.scopeRef === "string"
    && opaqueRefPattern.test(value.scopeRef)
    && revisionRef(value.run)
    && (value.task === null || revisionRef(value.task))
    && (value.approval === null || approvalRef(value.approval))
    && (value.artifact === null || artifactRef(value.artifact));
}

function surface(value: unknown): value is ViraContinuitySurface {
  return value === "web" || value === "ios" || value === "android" || value === "external-ai-host";
}

function connectivity(value: unknown): value is ViraContinuityConnectivity {
  return value === "online" || value === "offline" || value === "reconnected";
}

function sameRevision(left: ViraContinuityRevisionRef | null, right: ViraContinuityRevisionRef | null): boolean {
  if (left === null || right === null) return left === right;
  return left.id === right.id && left.revision === right.revision;
}

function sameApproval(left: ViraContinuityApprovalRef | null, right: ViraContinuityApprovalRef | null): boolean {
  if (left === null || right === null) return left === right;
  return left.id === right.id
    && left.planDigest === right.planDigest
    && left.planRevision === right.planRevision
    && left.decision === right.decision;
}

function sameArtifact(left: ViraContinuityArtifactRef | null, right: ViraContinuityArtifactRef | null): boolean {
  if (left === null || right === null) return left === right;
  return left.id === right.id && left.revision === right.revision && left.digest === right.digest;
}

function mismatch(
  out: ViraCrossSurfaceMismatch[],
  observation: ViraCrossSurfaceObservation,
  path: string,
  message: string,
): void {
  out.push(Object.freeze({ surface: observation.surface, path, message }));
}

export function evaluateViraCrossSurfaceContinuity(input: unknown): ViraCrossSurfaceContinuityResult {
  if (!plain(input) || typeof input.fixtureId !== "string" || !idPattern.test(input.fixtureId) || !authoritySnapshot(input.authority) || !Array.isArray(input.observations)) {
    return issue("INVALID_INPUT", "$", "cross-surface continuity input is invalid");
  }
  if (input.observations.length < 1 || input.observations.length > VIRA_CONTINUITY_SURFACES.length) {
    return issue("INVALID_INPUT", "$.observations", "continuity evidence requires one to four distinct surface observations");
  }

  const authority = input.authority;
  const seen = new Set<ViraContinuitySurface>();
  const observationResults: ViraCrossSurfaceObservationResult[] = [];

  for (let index = 0; index < input.observations.length; index += 1) {
    const raw = input.observations[index];
    if (!plain(raw) || !exactKeys(raw, observationKeys) || raw.version !== VIRA_CROSS_SURFACE_CONTINUITY_VERSION || !surface(raw.surface) || !connectivity(raw.connectivity) || !authoritySnapshot(raw.state)) {
      return issue("INVALID_OBSERVATION", `$.observations[${index}]`, "surface continuity observation is invalid");
    }
    const observation = raw as unknown as ViraCrossSurfaceObservation;
    if (seen.has(observation.surface)) {
      return issue("DUPLICATE_SURFACE", `$.observations[${index}].surface`, "each continuity surface may appear only once");
    }
    seen.add(observation.surface);

    const mismatches: ViraCrossSurfaceMismatch[] = [];
    if (observation.state.applicationReleaseRef !== authority.applicationReleaseRef) mismatch(mismatches, observation, "$.state.applicationReleaseRef", "Application release reference differs from authority");
    if (observation.state.scopeRef !== authority.scopeRef) mismatch(mismatches, observation, "$.state.scopeRef", "tenant scope reference differs from authority");
    if (!sameRevision(observation.state.run, authority.run)) mismatch(mismatches, observation, "$.state.run", "ApplicationRun identity or revision differs from authority");
    if (!sameRevision(observation.state.task, authority.task)) mismatch(mismatches, observation, "$.state.task", "Human Task identity or revision differs from authority");
    if (!sameApproval(observation.state.approval, authority.approval)) mismatch(mismatches, observation, "$.state.approval", "approval exact binding differs from authority");
    if (!sameArtifact(observation.state.artifact, authority.artifact)) mismatch(mismatches, observation, "$.state.artifact", "Artifact exact revision or digest differs from authority");

    observationResults.push(Object.freeze({
      surface: observation.surface,
      connectivity: observation.connectivity,
      synchronized: mismatches.length === 0,
      mismatches: Object.freeze(mismatches),
    }));
  }

  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_CROSS_SURFACE_CONTINUITY_VERSION,
      fixtureId: input.fixtureId,
      conformant: observationResults.every((result) => result.synchronized),
      observations: Object.freeze(observationResults),
    }),
  };
}
