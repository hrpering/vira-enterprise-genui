import type { ViraActionIntent, ViraActionReceipt } from "@vira-enterprise-genui/action-boundary";
import { createExperienceObservation, type ExperienceObservationName } from "@vira-enterprise-genui/experience-observability";
import type { ViraApprovalChallenge, ViraApprovalDecision, ViraGovernanceVerdict } from "@vira-enterprise-genui/governance";
import { isSemanticNamespace } from "@vira-enterprise-genui/protocol";
import { isRuntimeSessionInstanceId } from "@vira-enterprise-genui/runtime-core";
import type { TelemetryEvent } from "@vira-enterprise-genui/telemetry";

export const VIRA_ACTION_LEDGER_VERSION = "1" as const;
export const VIRA_ACTION_LEDGER_MAX_ENTRIES = 100_000 as const;
export const VIRA_ACTION_LEDGER_ENTRY_KINDS = Object.freeze([
  "experience.shown", "view.changed", "action.proposed", "policy.evaluated", "approval.requested",
  "approval.granted", "action.executed", "action.failed", "action.retry", "action.recovery",
] as const);
export type ViraActionLedgerEntryKind = (typeof VIRA_ACTION_LEDGER_ENTRY_KINDS)[number];
export type ViraActionLedgerPlatform = "web" | "ios" | "android";
export interface ViraActionLedgerSession { readonly version: "1"; readonly instanceId: string; readonly experienceId: string; readonly experienceVersion: string; readonly platform: ViraActionLedgerPlatform; readonly hostId: string; readonly hostVersion: string; readonly initialStateRevision: number; }
export interface ViraActionLedgerEntry { readonly version: "1"; readonly sequence: number; readonly occurredAt: string; readonly kind: ViraActionLedgerEntryKind; readonly stateRevision: number; readonly actionId?: string; readonly actionType?: string; readonly actionEffect?: "read" | "write" | "irreversible"; readonly expectedStateRevision?: number; readonly observedStateRevision?: number; readonly idempotencyKey?: string; readonly policyEffect?: "allow" | "deny" | "challenge" | "transform"; readonly policyProvider?: string; readonly reasonCode?: string; readonly challengeId?: string; readonly approverId?: string; readonly approverKind?: "user" | "agent"; readonly outcome?: "success" | "empty" | "error"; readonly viewId?: string; readonly note?: string; }
export interface ViraActionReplay { readonly version: "1"; readonly session: ViraActionLedgerSession; readonly entries: readonly ViraActionLedgerEntry[]; readonly sideEffectExecution: "forbidden"; }
export type ViraActionLedgerIssueCode = "INVALID_SESSION" | "ENTRY_LIMIT_EXCEEDED" | "INVALID_TIMESTAMP" | "INVALID_REVISION" | "ACTION_NOT_PROPOSED" | "ACTION_IDENTITY_MISMATCH" | "STAGE_ORDER_INVALID" | "INVALID_APPROVAL" | "INVALID_RECEIPT";
export interface ViraActionLedgerIssue { readonly code: ViraActionLedgerIssueCode; readonly path: string; readonly message: string; }
export type ViraActionLedgerResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: ViraActionLedgerIssue };
export interface ViraActionLedger {
  readonly version: "1"; readonly session: ViraActionLedgerSession; readonly entries: () => readonly ViraActionLedgerEntry[];
  readonly recordExperienceShown: (occurredAt: string, stateRevision: number) => ViraActionLedgerResult<ViraActionLedgerEntry>;
  readonly recordViewChanged: (occurredAt: string, stateRevision: number, viewId: string) => ViraActionLedgerResult<ViraActionLedgerEntry>;
  readonly recordActionProposed: (occurredAt: string, intent: ViraActionIntent) => ViraActionLedgerResult<ViraActionLedgerEntry>;
  readonly recordPolicyEvaluated: (occurredAt: string, actionId: string, verdict: ViraGovernanceVerdict) => ViraActionLedgerResult<ViraActionLedgerEntry>;
  readonly recordApprovalRequested: (occurredAt: string, challenge: ViraApprovalChallenge) => ViraActionLedgerResult<ViraActionLedgerEntry>;
  readonly recordApprovalGranted: (occurredAt: string, challenge: ViraApprovalChallenge, decision: ViraApprovalDecision) => ViraActionLedgerResult<ViraActionLedgerEntry>;
  readonly recordActionExecuted: (occurredAt: string, receipt: ViraActionReceipt) => ViraActionLedgerResult<ViraActionLedgerEntry>;
  readonly recordActionFailed: (occurredAt: string, actionId: string, stateRevision: number, note: string) => ViraActionLedgerResult<ViraActionLedgerEntry>;
  readonly recordRetry: (occurredAt: string, actionId: string, stateRevision: number, note?: string) => ViraActionLedgerResult<ViraActionLedgerEntry>;
  readonly recordRecovery: (occurredAt: string, actionId: string, stateRevision: number, note?: string) => ViraActionLedgerResult<ViraActionLedgerEntry>;
  readonly replay: () => ViraActionReplay; readonly telemetry: () => ViraActionLedgerResult<readonly TelemetryEvent[]>;
}

function fail<T>(code: ViraActionLedgerIssueCode, path: string, message: string): ViraActionLedgerResult<T> { return { ok: false, issue: Object.freeze({ code, path, message }) }; }
function boundedText(value: unknown, max = 256): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function safeRevision(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function validTimestamp(value: string): boolean { return createExperienceObservation({ name: "experience.action.started", source: "action-ledger", occurredAt: value }).ok; }
function telemetryName(kind: ViraActionLedgerEntryKind): ExperienceObservationName { switch (kind) { case "experience.shown": return "experience.shown"; case "view.changed": return "experience.view.changed"; case "action.proposed": return "experience.action.proposed"; case "policy.evaluated": return "experience.policy.evaluated"; case "approval.requested": return "experience.approval.requested"; case "approval.granted": return "experience.approval.granted"; case "action.executed": return "experience.action.executed"; case "action.failed": return "experience.action.failed"; case "action.retry": return "experience.action.retry"; case "action.recovery": return "experience.action.recovery"; } }

export function createViraActionLedger(input: { readonly instanceId: string; readonly experienceId: string; readonly experienceVersion: string; readonly platform: ViraActionLedgerPlatform; readonly hostId: string; readonly hostVersion: string; readonly initialStateRevision: number; }): ViraActionLedgerResult<ViraActionLedger> {
  if (!input || !isRuntimeSessionInstanceId(input.instanceId) || !isSemanticNamespace(input.experienceId) || !boundedText(input.experienceVersion) || (input.platform !== "web" && input.platform !== "ios" && input.platform !== "android") || !isSemanticNamespace(input.hostId) || !boundedText(input.hostVersion) || !safeRevision(input.initialStateRevision)) return fail("INVALID_SESSION", "$", "action ledger session is invalid");
  const session: ViraActionLedgerSession = Object.freeze({ version: "1", ...input });
  const log: ViraActionLedgerEntry[] = [];
  const proposed = new Map<string, { actionType: string; expectedStateRevision: number; idempotencyKey: string }>();
  const disposition = new Map<string, "allow" | "deny" | "challenge" | "transform">();
  const pendingChallenges = new Map<string, string>();
  const terminal = new Map<string, "executed" | "failed" | "denied">();
  const retried = new Set<string>();
  const recovered = new Set<string>();
  let lastStateRevision = session.initialStateRevision;

  const append = (entry: Omit<ViraActionLedgerEntry, "version" | "sequence">): ViraActionLedgerResult<ViraActionLedgerEntry> => {
    if (log.length >= VIRA_ACTION_LEDGER_MAX_ENTRIES) return fail("ENTRY_LIMIT_EXCEEDED", "$.entries", "action ledger entry limit exceeded");
    if (!validTimestamp(entry.occurredAt)) return fail("INVALID_TIMESTAMP", "$.occurredAt", "ledger timestamp is invalid");
    if (!safeRevision(entry.stateRevision) || entry.stateRevision < lastStateRevision) return fail("INVALID_REVISION", "$.stateRevision", "ledger state revision must be monotonic and cannot precede the session revision");
    const value = Object.freeze({ version: "1" as const, sequence: log.length, ...entry });
    log.push(value); lastStateRevision = entry.stateRevision; return { ok: true, value };
  };
  const action = (actionId: string) => proposed.get(actionId);
  const requireAction = <T>(actionId: unknown): ViraActionLedgerResult<T> | undefined => !boundedText(actionId) || !proposed.has(actionId) ? fail("ACTION_NOT_PROPOSED", "$.actionId", "action must be proposed before later ledger stages") : undefined;
  const validNote = (note: unknown): note is string => boundedText(note, 512);
  const challengeMatches = (challenge: ViraApprovalChallenge, current: { actionType: string; expectedStateRevision: number; idempotencyKey: string }): boolean => !!challenge && challenge.instanceId === session.instanceId && challenge.actionType === current.actionType && challenge.expectedStateRevision === current.expectedStateRevision && challenge.idempotencyKey === current.idempotencyKey && boundedText(challenge.challengeId) && boundedText(challenge.provider) && boundedText(challenge.reasonCode);
  const hasPendingChallenge = (actionId: string): boolean => { for (const pendingActionId of pendingChallenges.values()) if (pendingActionId === actionId) return true; return false; };

  const ledger: ViraActionLedger = {
    version: "1", session, entries: () => Object.freeze(log.slice()),
    recordExperienceShown: (occurredAt, stateRevision) => append({ occurredAt, kind: "experience.shown", stateRevision }),
    recordViewChanged: (occurredAt, stateRevision, viewId) => boundedText(viewId) ? append({ occurredAt, kind: "view.changed", stateRevision, viewId }) : fail("INVALID_SESSION", "$.viewId", "viewId is invalid"),
    recordActionProposed: (occurredAt, intent) => {
      if (!intent || intent.instanceId !== session.instanceId || !safeRevision(intent.expectedStateRevision) || !boundedText(intent.idempotencyKey) || !intent.action || !boundedText(intent.action.id) || !boundedText(intent.action.type)) return fail("ACTION_IDENTITY_MISMATCH", "$.intent", "ActionIntent does not match replay session");
      if (proposed.has(intent.action.id)) return fail("ACTION_IDENTITY_MISMATCH", "$.intent.action.id", "action was already proposed in this replay ledger");
      const written = append({ occurredAt, kind: "action.proposed", stateRevision: intent.expectedStateRevision, actionId: intent.action.id, actionType: intent.action.type, expectedStateRevision: intent.expectedStateRevision, idempotencyKey: intent.idempotencyKey });
      if (!written.ok) return written; proposed.set(intent.action.id, { actionType: intent.action.type, expectedStateRevision: intent.expectedStateRevision, idempotencyKey: intent.idempotencyKey }); return written;
    },
    recordPolicyEvaluated: (occurredAt, actionId, verdict) => {
      const missing = requireAction<ViraActionLedgerEntry>(actionId); if (missing) return missing;
      if (terminal.has(actionId) || hasPendingChallenge(actionId) || disposition.get(actionId) === "challenge") return fail("STAGE_ORDER_INVALID", "$.actionId", "policy evaluation is suspended by challenge or terminal state");
      if (!verdict || (verdict.effect !== "allow" && verdict.effect !== "deny" && verdict.effect !== "challenge" && verdict.effect !== "transform") || !boundedText(verdict.provider) || !boundedText(verdict.reasonCode)) return fail("ACTION_IDENTITY_MISMATCH", "$.verdict", "governance verdict is invalid");
      const current = action(actionId)!;
      const written = append({ occurredAt, kind: "policy.evaluated", stateRevision: current.expectedStateRevision, actionId, actionType: current.actionType, expectedStateRevision: current.expectedStateRevision, policyEffect: verdict.effect, policyProvider: verdict.provider, reasonCode: verdict.reasonCode });
      if (written.ok) { disposition.set(actionId, verdict.effect); if (verdict.effect === "deny") terminal.set(actionId, "denied"); }
      return written;
    },
    recordApprovalRequested: (occurredAt, challenge) => {
      const missing = requireAction<ViraActionLedgerEntry>(challenge?.actionId); if (missing) return missing; const current = action(challenge.actionId)!;
      if (disposition.get(challenge.actionId) !== "challenge" || terminal.has(challenge.actionId)) return fail("STAGE_ORDER_INVALID", "$.challenge", "approval request requires a challenge policy disposition");
      if (!challengeMatches(challenge, current) || pendingChallenges.has(challenge.challengeId) || hasPendingChallenge(challenge.actionId)) return fail("INVALID_APPROVAL", "$.challenge", "approval challenge does not match proposed action identity");
      const written = append({ occurredAt, kind: "approval.requested", stateRevision: current.expectedStateRevision, actionId: challenge.actionId, actionType: current.actionType, expectedStateRevision: current.expectedStateRevision, challengeId: challenge.challengeId, policyProvider: challenge.provider, reasonCode: challenge.reasonCode });
      if (written.ok) pendingChallenges.set(challenge.challengeId, challenge.actionId); return written;
    },
    recordApprovalGranted: (occurredAt, challenge, decision) => {
      const missing = requireAction<ViraActionLedgerEntry>(challenge?.actionId); if (missing) return missing; const current = action(challenge.actionId)!;
      if (!challengeMatches(challenge, current) || pendingChallenges.get(challenge.challengeId) !== challenge.actionId) return fail("STAGE_ORDER_INVALID", "$.challenge", "approval grant requires the exact previously requested challenge");
      if (!decision || decision.challengeId !== challenge.challengeId || decision.decision !== "approved" || !decision.approver || (decision.approver.kind !== "user" && decision.approver.kind !== "agent") || !boundedText(decision.approver.id)) return fail("INVALID_APPROVAL", "$.decision", "approval decision does not exactly approve the challenge");
      const written = append({ occurredAt, kind: "approval.granted", stateRevision: current.expectedStateRevision, actionId: challenge.actionId, actionType: current.actionType, expectedStateRevision: current.expectedStateRevision, challengeId: challenge.challengeId, approverId: decision.approver.id, approverKind: decision.approver.kind });
      if (written.ok) { pendingChallenges.delete(challenge.challengeId); disposition.set(challenge.actionId, "allow"); }
      return written;
    },
    recordActionExecuted: (occurredAt, receipt) => {
      const missing = requireAction<ViraActionLedgerEntry>(receipt?.actionId); if (missing) return missing; const current = action(receipt.actionId)!;
      const currentDisposition = disposition.get(receipt.actionId);
      if ((currentDisposition !== "allow" && currentDisposition !== "transform") || hasPendingChallenge(receipt.actionId) || terminal.has(receipt.actionId)) return fail("STAGE_ORDER_INVALID", "$.receipt", "execution requires an allow/transform policy disposition, completed approvals and no terminal outcome");
      if (!receipt || receipt.instanceId !== session.instanceId || receipt.actionType !== current.actionType || receipt.expectedStateRevision !== current.expectedStateRevision || receipt.idempotencyKey !== current.idempotencyKey || !safeRevision(receipt.observedStateRevision) || receipt.observedStateRevision < receipt.expectedStateRevision || (receipt.effect !== "read" && receipt.effect !== "write" && receipt.effect !== "irreversible") || (receipt.outcome !== "success" && receipt.outcome !== "empty" && receipt.outcome !== "error")) return fail("INVALID_RECEIPT", "$.receipt", "ActionReceipt does not match proposed action identity");
      const kind = receipt.outcome === "error" ? "action.failed" as const : "action.executed" as const;
      const written = append({ occurredAt, kind, stateRevision: receipt.observedStateRevision, actionId: receipt.actionId, actionType: receipt.actionType, actionEffect: receipt.effect, expectedStateRevision: receipt.expectedStateRevision, observedStateRevision: receipt.observedStateRevision, idempotencyKey: receipt.idempotencyKey, outcome: receipt.outcome });
      if (written.ok) terminal.set(receipt.actionId, receipt.outcome === "error" ? "failed" : "executed"); return written;
    },
    recordActionFailed: (occurredAt, actionId, stateRevision, note) => {
      const missing = requireAction<ViraActionLedgerEntry>(actionId); if (missing) return missing;
      const currentDisposition = disposition.get(actionId);
      if ((currentDisposition !== "allow" && currentDisposition !== "transform") || hasPendingChallenge(actionId) || terminal.has(actionId)) return fail("STAGE_ORDER_INVALID", "$.actionId", "failure requires an allow/transform policy disposition, completed approvals and no terminal outcome");
      if (!validNote(note)) return fail("INVALID_RECEIPT", "$.note", "failure note is invalid");
      const written = append({ occurredAt, kind: "action.failed", stateRevision, actionId, actionType: action(actionId)!.actionType, note });
      if (written.ok) terminal.set(actionId, "failed"); return written;
    },
    recordRetry: (occurredAt, actionId, stateRevision, note) => {
      const missing = requireAction<ViraActionLedgerEntry>(actionId); if (missing) return missing;
      if (terminal.get(actionId) !== "failed" || retried.has(actionId)) return fail("STAGE_ORDER_INVALID", "$.actionId", "retry requires exactly one prior failed terminal outcome");
      if (note !== undefined && !validNote(note)) return fail("INVALID_RECEIPT", "$.note", "retry note is invalid");
      const written = append({ occurredAt, kind: "action.retry", stateRevision, actionId, actionType: action(actionId)!.actionType, ...(note === undefined ? {} : { note }) });
      if (written.ok) retried.add(actionId); return written;
    },
    recordRecovery: (occurredAt, actionId, stateRevision, note) => {
      const missing = requireAction<ViraActionLedgerEntry>(actionId); if (missing) return missing;
      if (!retried.has(actionId) || recovered.has(actionId)) return fail("STAGE_ORDER_INVALID", "$.actionId", "recovery requires exactly one prior retry and may be recorded once");
      if (note !== undefined && !validNote(note)) return fail("INVALID_RECEIPT", "$.note", "recovery note is invalid");
      const written = append({ occurredAt, kind: "action.recovery", stateRevision, actionId, actionType: action(actionId)!.actionType, ...(note === undefined ? {} : { note }) });
      if (written.ok) recovered.add(actionId); return written;
    },
    replay: () => Object.freeze({ version: "1", session, entries: Object.freeze(log.slice()), sideEffectExecution: "forbidden" as const }),
    telemetry: () => {
      const events: TelemetryEvent[] = [];
      for (let index = 0; index < log.length; index += 1) {
        const entry = log[index]!;
        const event = createExperienceObservation({ name: telemetryName(entry.kind), source: "action-ledger", occurredAt: entry.occurredAt });
        if (!event.ok) return fail("INVALID_TIMESTAMP", `$.entries[${index}].occurredAt`, event.issue.message);
        events.push(event.value);
        if (entry.kind === "policy.evaluated" && entry.policyEffect === "deny") {
          const denied = createExperienceObservation({ name: "experience.action.denied", source: "action-ledger", occurredAt: entry.occurredAt });
          if (!denied.ok) return fail("INVALID_TIMESTAMP", `$.entries[${index}].occurredAt`, denied.issue.message);
          events.push(denied.value);
        }
      }
      return { ok: true, value: Object.freeze(events) };
    },
  };
  return { ok: true, value: Object.freeze(ledger) };
}
