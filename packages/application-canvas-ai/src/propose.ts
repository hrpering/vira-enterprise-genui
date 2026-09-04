import {
  parseViraCanvasDraft,
  type ViraCanvasDraft,
  type ViraCanvasGraphRef,
  type ViraCanvasSemantics,
} from "@vira-enterprise-genui/application-canvas";
import {
  parseViraApplicationPackage,
  type ViraApplicationActionReference,
  type ViraApplicationExactReference,
  type ViraApplicationExperienceReference,
  type ViraApplicationPackage,
} from "@vira-enterprise-genui/application-package";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_CANVAS_AI_EXPLANATION_MAX_LENGTH,
  VIRA_CANVAS_AI_MAX_DIFF_ENTRIES,
  VIRA_CANVAS_AI_MAX_SUPPORTED_REFERENCES,
  VIRA_CANVAS_AI_PROMPT_MAX_LENGTH,
  VIRA_CANVAS_AI_VERSION,
  type ViraCanvasAiDiffEntry,
  type ViraCanvasAiIssue,
  type ViraCanvasAiIssueCode,
  type ViraCanvasAiProposal,
  type ViraCanvasAiProposalResult,
  type ViraCanvasAiProvider,
  type ViraCanvasAiRequest,
  type ViraCanvasAiSupportedReferences,
} from "./types.js";

const FORBIDDEN_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const INPUT_FIELDS = Object.freeze(["prompt", "baseDraft", "supported"] as const);
const SUPPORTED_FIELDS = Object.freeze([
  "experiences",
  "capabilities",
  "contextTypes",
  "actions",
  "flows",
  "brandRefs",
  "governanceRequirements",
  "protocolProjections",
  "entitlementRefs",
  "meteringRefs",
  "hostCapabilities",
] as const);
const APPLICATION_DIFF_FIELDS = Object.freeze([
  "version",
  "publisher",
  "experiences",
  "capabilities",
  "contextTypes",
  "actions",
  "flows",
  "brandRef",
  "governanceRequirements",
  "hostCompatibility",
  "protocolProjections",
  "distribution",
  "commercial",
] as const);

type Failure = { readonly ok: false; readonly issue: ViraCanvasAiIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function issue(code: ViraCanvasAiIssueCode, path: string, message: string): ViraCanvasAiIssue {
  return Object.freeze({ code, path, message });
}

function failure(code: ViraCanvasAiIssueCode, path: string, message: string): Failure {
  return { ok: false, issue: issue(code, path, message) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function shape(
  value: JsonObject,
  allowed: readonly string[],
  required: readonly string[] = allowed,
): string | undefined {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).sort().find((key) => !allowedKeys.has(key))
    ?? required.find((key) => !Object.hasOwn(value, key));
}

function safeText(value: JsonValue | undefined, max: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= max
    && value.trim().length > 0
    && !FORBIDDEN_CONTROL_PATTERN.test(value);
}

function providerGenerate(provider: ViraCanvasAiProvider): ViraCanvasAiProvider["generate"] | undefined {
  if (provider === null || typeof provider !== "object" || Array.isArray(provider)) return undefined;
  try {
    const prototype = Object.getPrototypeOf(provider);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    if (Object.getOwnPropertySymbols(provider).length > 0) return undefined;
    const names = Object.getOwnPropertyNames(provider);
    const keys = Object.keys(provider);
    if (names.length !== keys.length || keys.length !== 1 || keys[0] !== "generate") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(provider, "generate");
    return descriptor && "value" in descriptor && descriptor.enumerable === true && typeof descriptor.value === "function"
      ? descriptor.value as ViraCanvasAiProvider["generate"]
      : undefined;
  } catch {
    return undefined;
  }
}

function exactKey(ref: ViraApplicationExactReference): string {
  return `${ref.id}\u0000${ref.versionRef}`;
}

function experienceKey(ref: ViraApplicationExperienceReference): string {
  return `${ref.id}\u0000${ref.packId}\u0000${ref.packVersion}\u0000${ref.entrypoint}`;
}

function actionKey(ref: ViraApplicationActionReference): string {
  return ref.actionType;
}

function graphKey(ref: ViraCanvasGraphRef): string {
  return `${ref.id}\u0000${ref.version}`;
}

function addExactKeys(target: Set<string>, values: readonly ViraApplicationExactReference[]): void {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value) target.add(exactKey(value));
  }
}

function addExperienceKeys(target: Set<string>, values: readonly ViraApplicationExperienceReference[]): void {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value) target.add(experienceKey(value));
  }
}

function addActionKeys(target: Set<string>, values: readonly ViraApplicationActionReference[]): void {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value) target.add(actionKey(value));
  }
}

function canonicalExactRef(
  value: JsonValue,
  base: ViraApplicationPackage,
  path: string,
): Parsed<ViraApplicationExactReference> {
  const parsed = parseViraApplicationPackage({ ...base, protocolProjections: [value] });
  if (!parsed.ok) return failure("INVALID_SUPPORTED_REFERENCES", path, parsed.issue.message);
  const canonical = parsed.value.protocolProjections[0];
  return canonical
    ? { ok: true, value: canonical }
    : failure("INVALID_SUPPORTED_REFERENCES", path, "exact reference did not canonicalize");
}

function canonicalExperience(
  value: JsonValue,
  base: ViraApplicationPackage,
  path: string,
): Parsed<ViraApplicationExperienceReference> {
  const parsed = parseViraApplicationPackage({ ...base, experiences: [value] });
  if (!parsed.ok) return failure("INVALID_SUPPORTED_REFERENCES", path, parsed.issue.message);
  const canonical = parsed.value.experiences[0];
  return canonical
    ? { ok: true, value: canonical }
    : failure("INVALID_SUPPORTED_REFERENCES", path, "experience reference did not canonicalize");
}

function canonicalAction(
  value: JsonValue,
  base: ViraApplicationPackage,
  path: string,
): Parsed<ViraApplicationActionReference> {
  const parsed = parseViraApplicationPackage({ ...base, actions: [value] });
  if (!parsed.ok) return failure("INVALID_SUPPORTED_REFERENCES", path, parsed.issue.message);
  const canonical = parsed.value.actions[0];
  return canonical
    ? { ok: true, value: canonical }
    : failure("INVALID_SUPPORTED_REFERENCES", path, "action reference did not canonicalize");
}

function canonicalHostCapability(
  value: JsonValue,
  base: ViraApplicationPackage,
  path: string,
): Parsed<string> {
  const parsed = parseViraApplicationPackage({
    ...base,
    hostCompatibility: { ...base.hostCompatibility, requiredCapabilities: [value] },
  });
  if (!parsed.ok) return failure("INVALID_SUPPORTED_REFERENCES", path, parsed.issue.message);
  const canonical = parsed.value.hostCompatibility.requiredCapabilities[0];
  return canonical
    ? { ok: true, value: canonical }
    : failure("INVALID_SUPPORTED_REFERENCES", path, "host capability did not canonicalize");
}

function parseExactList(
  value: JsonValue | undefined,
  base: ViraApplicationPackage,
  path: string,
): Parsed<readonly ViraApplicationExactReference[]> {
  if (value === undefined) return { ok: true, value: Object.freeze([]) };
  if (!Array.isArray(value) || value.length > VIRA_CANVAS_AI_MAX_SUPPORTED_REFERENCES) {
    return failure("INVALID_SUPPORTED_REFERENCES", path, `supported reference list must be an array bounded to ${VIRA_CANVAS_AI_MAX_SUPPORTED_REFERENCES}`);
  }
  const result: ViraApplicationExactReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = canonicalExactRef(value[index] as JsonValue, base, `${path}[${index}]`);
    if (!parsed.ok) return parsed;
    const key = exactKey(parsed.value);
    if (seen.has(key)) return failure("INVALID_SUPPORTED_REFERENCES", `${path}[${index}]`, "duplicate supported exact reference");
    seen.add(key);
    result.push(parsed.value);
  }
  return { ok: true, value: Object.freeze(result) };
}

function parseExperienceList(
  value: JsonValue | undefined,
  base: ViraApplicationPackage,
  path: string,
): Parsed<readonly ViraApplicationExperienceReference[]> {
  if (value === undefined) return { ok: true, value: Object.freeze([]) };
  if (!Array.isArray(value) || value.length > VIRA_CANVAS_AI_MAX_SUPPORTED_REFERENCES) {
    return failure("INVALID_SUPPORTED_REFERENCES", path, `supported experience list must be an array bounded to ${VIRA_CANVAS_AI_MAX_SUPPORTED_REFERENCES}`);
  }
  const result: ViraApplicationExperienceReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = canonicalExperience(value[index] as JsonValue, base, `${path}[${index}]`);
    if (!parsed.ok) return parsed;
    const key = experienceKey(parsed.value);
    if (seen.has(key)) return failure("INVALID_SUPPORTED_REFERENCES", `${path}[${index}]`, "duplicate supported Experience reference");
    seen.add(key);
    result.push(parsed.value);
  }
  return { ok: true, value: Object.freeze(result) };
}

function parseActionList(
  value: JsonValue | undefined,
  base: ViraApplicationPackage,
  path: string,
): Parsed<readonly ViraApplicationActionReference[]> {
  if (value === undefined) return { ok: true, value: Object.freeze([]) };
  if (!Array.isArray(value) || value.length > VIRA_CANVAS_AI_MAX_SUPPORTED_REFERENCES) {
    return failure("INVALID_SUPPORTED_REFERENCES", path, `supported action list must be an array bounded to ${VIRA_CANVAS_AI_MAX_SUPPORTED_REFERENCES}`);
  }
  const result: ViraApplicationActionReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = canonicalAction(value[index] as JsonValue, base, `${path}[${index}]`);
    if (!parsed.ok) return parsed;
    const key = actionKey(parsed.value);
    if (seen.has(key)) return failure("INVALID_SUPPORTED_REFERENCES", `${path}[${index}]`, "duplicate supported Action reference");
    seen.add(key);
    result.push(parsed.value);
  }
  return { ok: true, value: Object.freeze(result) };
}

function parseHostCapabilityList(
  value: JsonValue | undefined,
  base: ViraApplicationPackage,
  path: string,
): Parsed<readonly string[]> {
  if (value === undefined) return { ok: true, value: Object.freeze([]) };
  if (!Array.isArray(value) || value.length > VIRA_CANVAS_AI_MAX_SUPPORTED_REFERENCES) {
    return failure("INVALID_SUPPORTED_REFERENCES", path, `supported host capability list must be an array bounded to ${VIRA_CANVAS_AI_MAX_SUPPORTED_REFERENCES}`);
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = canonicalHostCapability(value[index] as JsonValue, base, `${path}[${index}]`);
    if (!parsed.ok) return parsed;
    if (seen.has(parsed.value)) return failure("INVALID_SUPPORTED_REFERENCES", `${path}[${index}]`, "duplicate supported host capability");
    seen.add(parsed.value);
    result.push(parsed.value);
  }
  return { ok: true, value: Object.freeze(result) };
}

function parseSupported(
  value: JsonValue | undefined,
  base: ViraApplicationPackage,
): Parsed<ViraCanvasAiSupportedReferences> {
  if (value === undefined) {
    return {
      ok: true,
      value: Object.freeze({
        experiences: Object.freeze([]), capabilities: Object.freeze([]), contextTypes: Object.freeze([]),
        actions: Object.freeze([]), flows: Object.freeze([]), brandRefs: Object.freeze([]),
        governanceRequirements: Object.freeze([]), protocolProjections: Object.freeze([]),
        entitlementRefs: Object.freeze([]), meteringRefs: Object.freeze([]), hostCapabilities: Object.freeze([]),
      }),
    };
  }
  if (!object(value)) return failure("INVALID_SUPPORTED_REFERENCES", "$.supported", "supported must be an exact object");
  const unexpected = shape(value, SUPPORTED_FIELDS, []);
  if (unexpected) return failure("INVALID_SUPPORTED_REFERENCES", `$.supported.${unexpected}`, "unknown supported-reference field");

  const experiences = parseExperienceList(value.experiences, base, "$.supported.experiences"); if (!experiences.ok) return experiences;
  const capabilities = parseExactList(value.capabilities, base, "$.supported.capabilities"); if (!capabilities.ok) return capabilities;
  const contextTypes = parseExactList(value.contextTypes, base, "$.supported.contextTypes"); if (!contextTypes.ok) return contextTypes;
  const actions = parseActionList(value.actions, base, "$.supported.actions"); if (!actions.ok) return actions;
  const flows = parseExactList(value.flows, base, "$.supported.flows"); if (!flows.ok) return flows;
  const brandRefs = parseExactList(value.brandRefs, base, "$.supported.brandRefs"); if (!brandRefs.ok) return brandRefs;
  const governanceRequirements = parseExactList(value.governanceRequirements, base, "$.supported.governanceRequirements"); if (!governanceRequirements.ok) return governanceRequirements;
  const protocolProjections = parseExactList(value.protocolProjections, base, "$.supported.protocolProjections"); if (!protocolProjections.ok) return protocolProjections;
  const entitlementRefs = parseExactList(value.entitlementRefs, base, "$.supported.entitlementRefs"); if (!entitlementRefs.ok) return entitlementRefs;
  const meteringRefs = parseExactList(value.meteringRefs, base, "$.supported.meteringRefs"); if (!meteringRefs.ok) return meteringRefs;
  const hostCapabilities = parseHostCapabilityList(value.hostCapabilities, base, "$.supported.hostCapabilities"); if (!hostCapabilities.ok) return hostCapabilities;

  return {
    ok: true,
    value: Object.freeze({
      experiences: experiences.value,
      capabilities: capabilities.value,
      contextTypes: contextTypes.value,
      actions: actions.value,
      flows: flows.value,
      brandRefs: brandRefs.value,
      governanceRequirements: governanceRequirements.value,
      protocolProjections: protocolProjections.value,
      entitlementRefs: entitlementRefs.value,
      meteringRefs: meteringRefs.value,
      hostCapabilities: hostCapabilities.value,
    }),
  };
}

function unsupportedCandidateReference(
  base: ViraCanvasDraft,
  candidate: ViraCanvasSemantics,
  supported: ViraCanvasAiSupportedReferences,
): Failure | undefined {
  const baseApp = base.semantics.application;
  const app = candidate.application;

  const experiences = new Set<string>(); addExperienceKeys(experiences, baseApp.experiences); addExperienceKeys(experiences, supported.experiences);
  const capabilities = new Set<string>(); addExactKeys(capabilities, baseApp.capabilities); addExactKeys(capabilities, supported.capabilities);
  const contextTypes = new Set<string>(); addExactKeys(contextTypes, baseApp.contextTypes); addExactKeys(contextTypes, supported.contextTypes);
  const actions = new Set<string>(); addActionKeys(actions, baseApp.actions); addActionKeys(actions, supported.actions);
  const flows = new Set<string>(); addExactKeys(flows, baseApp.flows); addExactKeys(flows, supported.flows);
  for (let index = 0; index < candidate.graphs.length; index += 1) {
    const graph = candidate.graphs[index];
    if (graph) flows.add(`${graph.id}\u0000${graph.version}`);
  }
  const brandRefs = new Set<string>(); if (baseApp.brandRef) brandRefs.add(exactKey(baseApp.brandRef)); addExactKeys(brandRefs, supported.brandRefs);
  const governance = new Set<string>(); addExactKeys(governance, baseApp.governanceRequirements); addExactKeys(governance, supported.governanceRequirements);
  const projections = new Set<string>(); addExactKeys(projections, baseApp.protocolProjections); addExactKeys(projections, supported.protocolProjections);
  const entitlements = new Set<string>(); addExactKeys(entitlements, baseApp.commercial.entitlementRefs); addExactKeys(entitlements, supported.entitlementRefs);
  const metering = new Set<string>(); addExactKeys(metering, baseApp.commercial.meteringRefs); addExactKeys(metering, supported.meteringRefs);
  const hostCapabilities = new Set<string>(baseApp.hostCompatibility.requiredCapabilities); for (const value of supported.hostCapabilities) hostCapabilities.add(value);

  for (let index = 0; index < app.experiences.length; index += 1) {
    const value = app.experiences[index];
    if (value && !experiences.has(experienceKey(value))) return failure("UNSUPPORTED_REFERENCE", `$.candidate.application.experiences[${index}]`, "candidate introduced an unsupported Experience reference");
  }
  for (let index = 0; index < app.capabilities.length; index += 1) {
    const value = app.capabilities[index];
    if (value && !capabilities.has(exactKey(value))) return failure("UNSUPPORTED_REFERENCE", `$.candidate.application.capabilities[${index}]`, "candidate introduced an unsupported Capability reference");
  }
  for (let index = 0; index < app.contextTypes.length; index += 1) {
    const value = app.contextTypes[index];
    if (value && !contextTypes.has(exactKey(value))) return failure("UNSUPPORTED_REFERENCE", `$.candidate.application.contextTypes[${index}]`, "candidate introduced an unsupported Context reference");
  }
  for (let index = 0; index < app.actions.length; index += 1) {
    const value = app.actions[index];
    if (value && !actions.has(actionKey(value))) return failure("UNSUPPORTED_REFERENCE", `$.candidate.application.actions[${index}]`, "candidate introduced an unsupported Action reference");
  }
  for (let index = 0; index < app.flows.length; index += 1) {
    const value = app.flows[index];
    if (value && !flows.has(exactKey(value))) return failure("UNSUPPORTED_REFERENCE", `$.candidate.application.flows[${index}]`, "candidate introduced an unsupported Flow reference");
  }
  if (app.brandRef && !brandRefs.has(exactKey(app.brandRef))) return failure("UNSUPPORTED_REFERENCE", "$.candidate.application.brandRef", "candidate introduced an unsupported Brand reference");
  for (let index = 0; index < app.governanceRequirements.length; index += 1) {
    const value = app.governanceRequirements[index];
    if (value && !governance.has(exactKey(value))) return failure("UNSUPPORTED_REFERENCE", `$.candidate.application.governanceRequirements[${index}]`, "candidate introduced an unsupported governance reference");
  }
  for (let index = 0; index < app.protocolProjections.length; index += 1) {
    const value = app.protocolProjections[index];
    if (value && !projections.has(exactKey(value))) return failure("UNSUPPORTED_REFERENCE", `$.candidate.application.protocolProjections[${index}]`, "candidate introduced an unsupported protocol projection");
  }
  for (let index = 0; index < app.commercial.entitlementRefs.length; index += 1) {
    const value = app.commercial.entitlementRefs[index];
    if (value && !entitlements.has(exactKey(value))) return failure("UNSUPPORTED_REFERENCE", `$.candidate.application.commercial.entitlementRefs[${index}]`, "candidate introduced an unsupported entitlement reference");
  }
  for (let index = 0; index < app.commercial.meteringRefs.length; index += 1) {
    const value = app.commercial.meteringRefs[index];
    if (value && !metering.has(exactKey(value))) return failure("UNSUPPORTED_REFERENCE", `$.candidate.application.commercial.meteringRefs[${index}]`, "candidate introduced an unsupported metering reference");
  }
  for (let index = 0; index < app.hostCompatibility.requiredCapabilities.length; index += 1) {
    const value = app.hostCompatibility.requiredCapabilities[index];
    if (value && !hostCapabilities.has(value)) return failure("UNSUPPORTED_REFERENCE", `$.candidate.application.hostCompatibility.requiredCapabilities[${index}]`, "candidate introduced an unsupported host capability");
  }

  const baseGraphs = new Map<string, ViraCanvasSemantics["graphs"][number]>();
  for (const graph of base.semantics.graphs) baseGraphs.set(graphKey({ id: graph.id, version: graph.version }), graph);
  for (let graphIndex = 0; graphIndex < candidate.graphs.length; graphIndex += 1) {
    const graph = candidate.graphs[graphIndex];
    if (!graph) continue;
    const previous = baseGraphs.get(graphKey({ id: graph.id, version: graph.version }));
    if (!previous && graph.publisher.id !== baseApp.publisher.id) {
      return failure("UNSUPPORTED_REFERENCE", `$.candidate.graphs[${graphIndex}].publisher.id`, "new graphs must remain in the current Application publisher namespace");
    }
    for (let nodeIndex = 0; nodeIndex < graph.nodes.length; nodeIndex += 1) {
      const node = graph.nodes[nodeIndex];
      if (!node) continue;
      if (node.target.kind === "experience" && !experiences.has(experienceKey(node.target.ref))) {
        return failure("UNSUPPORTED_REFERENCE", `$.candidate.graphs[${graphIndex}].nodes[${nodeIndex}].target.ref`, "graph node introduced an unsupported Experience reference");
      }
      if (node.target.kind === "capability" && !capabilities.has(exactKey(node.target.ref))) {
        return failure("UNSUPPORTED_REFERENCE", `$.candidate.graphs[${graphIndex}].nodes[${nodeIndex}].target.ref`, "graph node introduced an unsupported Capability reference");
      }
      if (node.target.kind === "context" && !contextTypes.has(exactKey(node.target.ref))) {
        return failure("UNSUPPORTED_REFERENCE", `$.candidate.graphs[${graphIndex}].nodes[${nodeIndex}].target.ref`, "graph node introduced an unsupported Context reference");
      }
      if (node.target.kind === "action" && !actions.has(node.target.actionType)) {
        return failure("UNSUPPORTED_REFERENCE", `$.candidate.graphs[${graphIndex}].nodes[${nodeIndex}].target.actionType`, "graph node introduced an unsupported Action reference");
      }
    }
  }
  return undefined;
}

function semanticDiff(base: ViraCanvasSemantics, candidate: ViraCanvasSemantics): Parsed<readonly ViraCanvasAiDiffEntry[]> {
  const diff: ViraCanvasAiDiffEntry[] = [];
  for (const field of APPLICATION_DIFF_FIELDS) {
    if (JSON.stringify(base.application[field]) !== JSON.stringify(candidate.application[field])) {
      diff.push(Object.freeze({ kind: "application-field-changed", path: `$.semantics.application.${field}` }));
    }
  }

  const baseGraphs = new Map<string, ViraCanvasSemantics["graphs"][number]>();
  const candidateGraphs = new Map<string, ViraCanvasSemantics["graphs"][number]>();
  for (const graph of base.graphs) baseGraphs.set(graphKey({ id: graph.id, version: graph.version }), graph);
  for (const graph of candidate.graphs) candidateGraphs.set(graphKey({ id: graph.id, version: graph.version }), graph);
  const keys = [...new Set([...baseGraphs.keys(), ...candidateGraphs.keys()])].sort((left, right) => left.localeCompare(right));
  for (const key of keys) {
    const before = baseGraphs.get(key);
    const after = candidateGraphs.get(key);
    const source = after ?? before;
    if (!source) continue;
    const graphRef = Object.freeze({ id: source.id, version: source.version });
    if (!before) diff.push(Object.freeze({ kind: "graph-added", path: "$.semantics.graphs", graphRef }));
    else if (!after) diff.push(Object.freeze({ kind: "graph-removed", path: "$.semantics.graphs", graphRef }));
    else if (JSON.stringify(before) !== JSON.stringify(after)) diff.push(Object.freeze({ kind: "graph-changed", path: "$.semantics.graphs", graphRef }));
  }
  if (diff.length > VIRA_CANVAS_AI_MAX_DIFF_ENTRIES) {
    return failure("DIFF_LIMIT_EXCEEDED", "$.diff", `semantic diff exceeds ${VIRA_CANVAS_AI_MAX_DIFF_ENTRIES} entries`);
  }
  return { ok: true, value: Object.freeze(diff) };
}

export async function generateViraCanvasAiProposal(
  input: unknown,
  provider: ViraCanvasAiProvider,
): Promise<ViraCanvasAiProposalResult> {
  const parsedInput = parseJsonValue(input, "$");
  if (!parsedInput.ok || !object(parsedInput.value)) {
    return failure("INVALID_INPUT", parsedInput.ok ? "$" : parsedInput.issue.path, parsedInput.ok ? "Canvas AI input must be an exact object" : parsedInput.issue.reason);
  }
  const root = parsedInput.value;
  const unexpected = shape(root, INPUT_FIELDS, ["prompt", "baseDraft"]);
  if (unexpected) return failure("INVALID_INPUT", `$.${unexpected}`, "unknown or missing Canvas AI input field");
  if (!safeText(root.prompt, VIRA_CANVAS_AI_PROMPT_MAX_LENGTH)) {
    return failure("INVALID_PROMPT", "$.prompt", `prompt must be non-empty, bounded to ${VIRA_CANVAS_AI_PROMPT_MAX_LENGTH} characters and free of unsafe control characters`);
  }

  const base = parseViraCanvasDraft(root.baseDraft);
  if (!base.ok) return failure("INVALID_BASE_DRAFT", `$.baseDraft${base.issue.path === "$" ? "" : base.issue.path.slice(1)}`, base.issue.message);
  const supported = parseSupported(root.supported, base.value.semantics.application);
  if (!supported.ok) return supported;
  const generate = providerGenerate(provider);
  if (!generate) return failure("INVALID_PROVIDER", "$.provider", "Canvas AI provider must be an exact own-data object containing only an enumerable generate function");

  const request: ViraCanvasAiRequest = Object.freeze({
    version: VIRA_CANVAS_AI_VERSION,
    prompt: root.prompt,
    draftId: base.value.draftId,
    editorRevision: base.value.editorRevision,
    baseSemantics: base.value.semantics,
    supported: supported.value,
  });

  let rawResponse: unknown;
  try {
    rawResponse = await generate(request);
  } catch {
    return failure("PROVIDER_FAILED", "$.provider", "Canvas AI provider failed while generating a semantic proposal");
  }

  const parsedResponse = parseJsonValue(rawResponse, "$");
  if (!parsedResponse.ok || !object(parsedResponse.value)) {
    return failure("INVALID_PROVIDER_RESPONSE", parsedResponse.ok ? "$.providerResponse" : `$.providerResponse${parsedResponse.issue.path === "$" ? "" : parsedResponse.issue.path.slice(1)}`, "provider response must be an exact safe data object");
  }
  const response = parsedResponse.value;
  const responseUnexpected = shape(response, ["semantics", "explanation"]);
  if (responseUnexpected) return failure("INVALID_PROVIDER_RESPONSE", `$.providerResponse.${responseUnexpected}`, "provider response must contain only semantics and explanation");
  if (!safeText(response.explanation, VIRA_CANVAS_AI_EXPLANATION_MAX_LENGTH)) {
    return failure("INVALID_PROVIDER_RESPONSE", "$.providerResponse.explanation", `explanation must be non-empty, bounded to ${VIRA_CANVAS_AI_EXPLANATION_MAX_LENGTH} characters and free of unsafe control characters`);
  }

  const semanticDraft = parseViraCanvasDraft({
    schemaVersion: base.value.schemaVersion,
    draftId: base.value.draftId,
    editorRevision: base.value.editorRevision,
    semantics: response.semantics,
    projection: { activeGraphRef: null, graphViews: [] },
  });
  if (!semanticDraft.ok) return failure("INVALID_CANDIDATE", `$.candidate${semanticDraft.issue.path === "$" ? "" : semanticDraft.issue.path.slice(1)}`, semanticDraft.issue.message);
  const candidate = semanticDraft.value.semantics;
  if (
    candidate.application.identity.id !== base.value.semantics.application.identity.id
    || candidate.application.publisher.id !== base.value.semantics.application.publisher.id
  ) {
    return failure("IDENTITY_MISMATCH", "$.candidate.application", "Canvas AI candidate must preserve Application identity and publisher authority");
  }

  const unsupported = unsupportedCandidateReference(base.value, candidate, supported.value);
  if (unsupported) return unsupported;
  const diff = semanticDiff(base.value.semantics, candidate);
  if (!diff.ok) return diff;

  const projectionCompatible = parseViraCanvasDraft({
    schemaVersion: base.value.schemaVersion,
    draftId: base.value.draftId,
    editorRevision: base.value.editorRevision,
    semantics: candidate,
    projection: base.value.projection,
  }).ok;

  const proposal: ViraCanvasAiProposal = Object.freeze({
    version: VIRA_CANVAS_AI_VERSION,
    draftId: base.value.draftId,
    expectedRevision: base.value.editorRevision,
    baseSemantics: base.value.semantics,
    candidateSemantics: candidate,
    explanation: response.explanation,
    diff: diff.value,
    projectionCompatibility: projectionCompatible ? "compatible" : "requires-reconcile",
  });
  return { ok: true, value: proposal };
}
