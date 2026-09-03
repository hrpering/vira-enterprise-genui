import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import { createRuntimeAction } from "@vira-enterprise-genui/runtime-core";
import {
  VIRA_GOVERNANCE_MAX_OBLIGATIONS,
  VIRA_GOVERNANCE_MAX_PROVIDERS,
  VIRA_GOVERNANCE_VERSION,
  type ViraApprovalChallenge,
  type ViraApprovalDecision,
  type ViraApprovalProvider,
  type ViraCoreSafetyVerdict,
  type ViraGovernanceContext,
  type ViraGovernanceEvaluationInput,
  type ViraGovernanceEvaluationResult,
  type ViraGovernanceIssue,
  type ViraGovernanceIssueCode,
  type ViraGovernanceObligation,
  type ViraGovernancePipeline,
  type ViraGovernancePipelineCreateResult,
  type ViraGovernancePipelineInput,
  type ViraGovernanceProvider,
  type ViraGovernanceVerdict,
} from "./types.js";
import { parseViraPrincipal } from "./identity.js";

const EFFECTS = new Set(["allow", "deny", "challenge", "transform"]);
const PLATFORMS = new Set(["web", "ios", "android"]);
const VERDICT_REQUIRED = new Set(["version", "effect", "reasonCode", "obligations", "provider"]);
const VERDICT_OPTIONAL = new Set(["evidenceRef", "transformedPayload"]);
const OBLIGATION_REQUIRED = new Set(["id"]);
const OBLIGATION_OPTIONAL = new Set(["params"]);
const APPROVAL_REQUIRED = new Set(["version", "challengeId", "decision", "approver"]);
const APPROVAL_OPTIONAL = new Set(["evidenceRef"]);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function issue(code: ViraGovernanceIssueCode, path: string, message: string): ViraGovernanceIssue {
  return Object.freeze({ code, path, message });
}
function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}
function exact(value: JsonObject, required: ReadonlySet<string>, optional: ReadonlySet<string> = new Set()): boolean {
  const keys = Object.keys(value);
  return keys.every((key) => required.has(key) || optional.has(key)) && [...required].every((key) => Object.hasOwn(value, key));
}
function bounded(value: unknown, max = 4_096): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
function parseCoreSafety(input: unknown): ViraCoreSafetyVerdict | undefined {
  const parsed = parseJsonValue(input, "$.coreSafety");
  if (!parsed.ok || !isObject(parsed.value)) return undefined;
  if (Object.keys(parsed.value).length !== 3 || !Object.hasOwn(parsed.value, "version") || !Object.hasOwn(parsed.value, "effect") || !Object.hasOwn(parsed.value, "reasonCode")) return undefined;
  if (parsed.value.version !== VIRA_GOVERNANCE_VERSION || (parsed.value.effect !== "allow" && parsed.value.effect !== "deny") || !bounded(parsed.value.reasonCode, 256)) return undefined;
  return Object.freeze({ version: VIRA_GOVERNANCE_VERSION, effect: parsed.value.effect, reasonCode: parsed.value.reasonCode });
}
function parseContext(input: unknown): ViraGovernanceContext | undefined {
  const parsed = parseJsonValue(input, "$.context");
  if (!parsed.ok || !isObject(parsed.value)) return undefined;
  const allowed = new Set(["version", "instanceId", "experienceId", "experienceVersion", "platform", "userPrincipal", "agentPrincipal", "actionIntent"]);
  if (Object.keys(parsed.value).some((key) => !allowed.has(key))) return undefined;
  for (const required of ["version", "instanceId", "experienceId", "experienceVersion", "platform", "actionIntent"]) if (!Object.hasOwn(parsed.value, required)) return undefined;
  if (parsed.value.version !== VIRA_GOVERNANCE_VERSION || !bounded(parsed.value.instanceId) || !bounded(parsed.value.experienceId) || !bounded(parsed.value.experienceVersion, 256) || typeof parsed.value.platform !== "string" || !PLATFORMS.has(parsed.value.platform)) return undefined;
  const userPrincipal = Object.hasOwn(parsed.value, "userPrincipal") ? parseViraPrincipal(parsed.value.userPrincipal, "user") : undefined;
  const agentPrincipal = Object.hasOwn(parsed.value, "agentPrincipal") ? parseViraPrincipal(parsed.value.agentPrincipal, "agent") : undefined;
  if (Object.hasOwn(parsed.value, "userPrincipal") && userPrincipal === undefined) return undefined;
  if (Object.hasOwn(parsed.value, "agentPrincipal") && agentPrincipal === undefined) return undefined;
  const intent = parsed.value.actionIntent;
  if (!isObject(intent)) return undefined;
  const action = createRuntimeAction(intent.action);
  if (!action.ok) return undefined;
  if (intent.version !== "1" || intent.instanceId !== parsed.value.instanceId || typeof intent.expectedStateRevision !== "number" || !Number.isSafeInteger(intent.expectedStateRevision) || intent.expectedStateRevision < 0 || !bounded(intent.idempotencyKey, 256) || !IDEMPOTENCY_KEY.test(intent.idempotencyKey)) return undefined;
  if (Object.keys(intent).length !== 5 || !["version", "instanceId", "expectedStateRevision", "idempotencyKey", "action"].every((key) => Object.hasOwn(intent, key))) return undefined;
  return Object.freeze({
    version: VIRA_GOVERNANCE_VERSION,
    instanceId: parsed.value.instanceId,
    experienceId: parsed.value.experienceId,
    experienceVersion: parsed.value.experienceVersion,
    platform: parsed.value.platform as ViraGovernanceContext["platform"],
    ...(userPrincipal === undefined ? {} : { userPrincipal }),
    ...(agentPrincipal === undefined ? {} : { agentPrincipal }),
    actionIntent: Object.freeze({ version: "1", instanceId: parsed.value.instanceId, expectedStateRevision: intent.expectedStateRevision, idempotencyKey: intent.idempotencyKey, action: action.value }),
  });
}
function parseObligations(input: JsonValue | undefined, allowed: ReadonlySet<string>): ViraGovernanceObligation[] | undefined {
  if (!Array.isArray(input) || input.length > VIRA_GOVERNANCE_MAX_OBLIGATIONS) return undefined;
  const result: ViraGovernanceObligation[] = [];
  const identities = new Set<string>();
  for (const raw of input) {
    if (!isObject(raw) || !exact(raw, OBLIGATION_REQUIRED, OBLIGATION_OPTIONAL)) return undefined;
    if (typeof raw.id !== "string" || !isSemanticNamespace(raw.id) || !allowed.has(raw.id) || !identities.add(raw.id)) return undefined;
    let params: JsonObject | undefined;
    if (Object.hasOwn(raw, "params")) { if (!isObject(raw.params)) return undefined; params = raw.params; }
    result.push(Object.freeze({ id: raw.id, ...(params === undefined ? {} : { params }) }));
  }
  return result;
}
function parseVerdict(input: unknown, expectedProvider: string, allowedObligations: ReadonlySet<string>): ViraGovernanceVerdict | undefined {
  const parsed = parseJsonValue(input, "$.verdict");
  if (!parsed.ok || !isObject(parsed.value) || !exact(parsed.value, VERDICT_REQUIRED, VERDICT_OPTIONAL)) return undefined;
  if (parsed.value.version !== VIRA_GOVERNANCE_VERSION || typeof parsed.value.effect !== "string" || !EFFECTS.has(parsed.value.effect) || !bounded(parsed.value.reasonCode, 256) || parsed.value.provider !== expectedProvider) return undefined;
  const obligations = parseObligations(parsed.value.obligations, allowedObligations);
  if (!obligations) return undefined;
  const evidenceRef = Object.hasOwn(parsed.value, "evidenceRef") ? parsed.value.evidenceRef : undefined;
  if (evidenceRef !== undefined && !bounded(evidenceRef)) return undefined;
  const transformedPayload = Object.hasOwn(parsed.value, "transformedPayload") ? parsed.value.transformedPayload : undefined;
  if (parsed.value.effect === "transform") { if (!isObject(transformedPayload)) return undefined; } else if (transformedPayload !== undefined) return undefined;
  return Object.freeze({ version: VIRA_GOVERNANCE_VERSION, effect: parsed.value.effect as ViraGovernanceVerdict["effect"], reasonCode: parsed.value.reasonCode, obligations: Object.freeze(obligations), provider: expectedProvider, ...(evidenceRef === undefined ? {} : { evidenceRef: evidenceRef as string }), ...(transformedPayload === undefined ? {} : { transformedPayload: transformedPayload as JsonObject }) });
}
function makeChallenge(context: ViraGovernanceContext, verdict: ViraGovernanceVerdict): ViraApprovalChallenge {
  const intent = context.actionIntent;
  return Object.freeze({
    version: VIRA_GOVERNANCE_VERSION,
    challengeId: `challenge:${verdict.provider}:${intent.action.id}:${intent.expectedStateRevision}:${intent.idempotencyKey}`,
    instanceId: context.instanceId,
    actionId: intent.action.id,
    actionType: intent.action.type,
    expectedStateRevision: intent.expectedStateRevision,
    idempotencyKey: intent.idempotencyKey,
    provider: verdict.provider,
    reasonCode: verdict.reasonCode,
    obligations: verdict.obligations,
  });
}
function parseApproval(input: unknown, challenge: ViraApprovalChallenge): ViraApprovalDecision | undefined {
  const parsed = parseJsonValue(input, "$.approval");
  if (!parsed.ok || !isObject(parsed.value) || !exact(parsed.value, APPROVAL_REQUIRED, APPROVAL_OPTIONAL)) return undefined;
  if (parsed.value.version !== VIRA_GOVERNANCE_VERSION || parsed.value.challengeId !== challenge.challengeId || (parsed.value.decision !== "approved" && parsed.value.decision !== "denied")) return undefined;
  const approver = parseViraPrincipal(parsed.value.approver, "user");
  if (!approver) return undefined;
  const evidenceRef = Object.hasOwn(parsed.value, "evidenceRef") ? parsed.value.evidenceRef : undefined;
  if (evidenceRef !== undefined && !bounded(evidenceRef)) return undefined;
  return Object.freeze({ version: VIRA_GOVERNANCE_VERSION, challengeId: challenge.challengeId, decision: parsed.value.decision, approver, ...(evidenceRef === undefined ? {} : { evidenceRef: evidenceRef as string }) });
}
function transformedContext(context: ViraGovernanceContext, payload: JsonObject): ViraGovernanceContext | undefined {
  const action = createRuntimeAction({ id: context.actionIntent.action.id, type: context.actionIntent.action.type, source: context.actionIntent.action.source, payload });
  if (!action.ok) return undefined;
  return Object.freeze({ ...context, actionIntent: Object.freeze({ ...context.actionIntent, action: action.value }) });
}
function validProvider(provider: ViraGovernanceProvider): boolean {
  return provider !== null && typeof provider === "object" && provider.version === VIRA_GOVERNANCE_VERSION && typeof provider.id === "string" && isSemanticNamespace(provider.id) && typeof provider.evaluate === "function";
}
function validApprovalProvider(provider: ViraApprovalProvider | undefined): boolean {
  return provider === undefined || (provider !== null && typeof provider === "object" && provider.version === VIRA_GOVERNANCE_VERSION && typeof provider.id === "string" && isSemanticNamespace(provider.id) && typeof provider.decide === "function");
}

export function createViraGovernancePipeline(input: ViraGovernancePipelineInput): ViraGovernancePipelineCreateResult {
  if (input === null || typeof input !== "object" || !Array.isArray(input.providers) || !Array.isArray(input.allowedObligations)) return { ok: false, issue: issue("INVALID_PIPELINE", "$", "governance pipeline input is invalid") };
  if (input.providers.length > VIRA_GOVERNANCE_MAX_PROVIDERS || input.providers.some((provider) => !validProvider(provider))) return { ok: false, issue: issue("INVALID_PROVIDER", "$.providers", "GovernanceProvider identity is invalid") };
  const providerIds = input.providers.map((provider) => provider.id);
  if (new Set(providerIds).size !== providerIds.length || !validApprovalProvider(input.approvalProvider)) return { ok: false, issue: issue("INVALID_PIPELINE", "$", "governance providers must be unique and approval provider valid") };
  if (input.allowedObligations.length > VIRA_GOVERNANCE_MAX_OBLIGATIONS || input.allowedObligations.some((id) => typeof id !== "string" || !isSemanticNamespace(id))) return { ok: false, issue: issue("INVALID_PIPELINE", "$.allowedObligations", "trusted obligation catalog is invalid") };
  const allowedObligations = new Set(input.allowedObligations);
  if (allowedObligations.size !== input.allowedObligations.length) return { ok: false, issue: issue("INVALID_PIPELINE", "$.allowedObligations", "trusted obligation catalog contains duplicates") };
  const providers = Object.freeze([...input.providers]);
  const approvalProvider = input.approvalProvider;

  const pipeline: ViraGovernancePipeline = {
    version: VIRA_GOVERNANCE_VERSION,
    async evaluate(evaluation: ViraGovernanceEvaluationInput): Promise<ViraGovernanceEvaluationResult> {
      const coreSafety = parseCoreSafety(evaluation?.coreSafety);
      if (!coreSafety) return { ok: false, issue: issue("INVALID_CORE_SAFETY", "$.coreSafety", "Vira Core Safety verdict is invalid") };
      const originalContext = parseContext(evaluation?.context);
      if (!originalContext) return { ok: false, issue: issue("INVALID_CONTEXT", "$.context", "governance context is invalid") };
      if (coreSafety.effect === "deny") return { ok: false, issue: issue("CORE_SAFETY_DENIED", "$.coreSafety", "Vira Core Safety deny cannot be overridden") };
      const supplied = evaluation?.approvals === undefined ? [] : evaluation.approvals;
      if (!Array.isArray(supplied) || supplied.length > VIRA_GOVERNANCE_MAX_PROVIDERS) return { ok: false, issue: issue("INVALID_APPROVAL", "$.approvals", "supplied approval set is invalid") };
      const suppliedByChallenge = new Map<string, unknown[]>();
      for (const candidate of supplied) {
        if (candidate === null || typeof candidate !== "object" || typeof candidate.challengeId !== "string") return { ok: false, issue: issue("INVALID_APPROVAL", "$.approvals", "supplied approval is invalid") };
        const list = suppliedByChallenge.get(candidate.challengeId) ?? [];
        list.push(candidate);
        suppliedByChallenge.set(candidate.challengeId, list);
      }

      let context = originalContext;
      const verdicts: ViraGovernanceVerdict[] = [];
      const approvals: ViraApprovalDecision[] = [];
      const consumedApprovalIds = new Set<string>();

      for (let index = 0; index < providers.length; index += 1) {
        const provider = providers[index]!;
        let raw: unknown;
        try { raw = await provider.evaluate(context); }
        catch { return { ok: false, issue: issue("PROVIDER_FAILED", `$.providers[${index}]`, "GovernanceProvider failed closed") }; }
        const verdict = parseVerdict(raw, provider.id, allowedObligations);
        if (!verdict) return { ok: false, issue: issue("INVALID_VERDICT", `$.providers[${index}]`, "GovernanceProvider returned an invalid verdict or obligation") };
        verdicts.push(verdict);
        if (verdict.effect === "deny") return { ok: false, issue: issue("GOVERNANCE_DENIED", `$.providers[${index}]`, "governance provider denied the protected action") };
        if (verdict.effect === "transform") {
          const next = transformedContext(context, verdict.transformedPayload!);
          if (!next) return { ok: false, issue: issue("TRANSFORM_INVALID", `$.providers[${index}]`, "provider transform produced an invalid action payload") };
          context = next;
          continue;
        }
        if (verdict.effect === "challenge") {
          const challenge = makeChallenge(context, verdict);
          const matching = suppliedByChallenge.get(challenge.challengeId) ?? [];
          if (matching.length > 1) return { ok: false, issue: issue("APPROVAL_REPLAY", "$.approvals", "multiple approval decisions target the same exact challenge"), challenge };
          let approval: ViraApprovalDecision | undefined;
          if (matching.length === 1) {
            approval = parseApproval(matching[0], challenge);
            if (!approval) return { ok: false, issue: issue("INVALID_APPROVAL", "$.approvals", "supplied approval does not match the exact challenge"), challenge };
            consumedApprovalIds.add(challenge.challengeId);
          } else if (approvalProvider) {
            let rawApproval: unknown;
            try { rawApproval = await approvalProvider.decide(challenge); }
            catch { return { ok: false, issue: issue("APPROVAL_FAILED", "$.approvalProvider", "ApprovalProvider failed closed"), challenge }; }
            approval = parseApproval(rawApproval, challenge);
            if (!approval) return { ok: false, issue: issue("INVALID_APPROVAL", "$.approvalProvider", "ApprovalProvider returned a non-matching decision"), challenge };
          } else {
            return { ok: false, issue: issue("APPROVAL_REQUIRED", `$.providers[${index}]`, "governance challenge requires exact approval"), challenge };
          }
          approvals.push(approval);
          if (approval.decision === "denied") return { ok: false, issue: issue("GOVERNANCE_DENIED", "$.approval", "approval challenge was denied"), challenge };
        }
      }
      for (const challengeId of suppliedByChallenge.keys()) {
        if (!consumedApprovalIds.has(challengeId)) return { ok: false, issue: issue("APPROVAL_REPLAY", "$.approvals", "approval was supplied for a challenge not produced by this exact evaluation") };
      }
      return { ok: true, value: Object.freeze({ effect: "allow" as const, context, verdicts: Object.freeze(verdicts), approvals: Object.freeze(approvals) }) };
    },
  };
  return { ok: true, value: Object.freeze(pipeline) };
}
