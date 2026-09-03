import { isSemanticNamespace, parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";
import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import {
  VIRA_EXPERIENCE_PACK_COMPOSITION_VERSION,
  VIRA_EXPERIENCE_PACK_MAX_POLICY_TEMPLATES,
  type ViraExperiencePackComposition,
  type ViraExperiencePackCompositionIssue,
  type ViraExperiencePackCompositionResult,
  type ViraExperiencePackPolicyTemplate,
} from "./types.js";

const POLICY_REF = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,511}$/;

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}
function failure(code: ViraExperiencePackCompositionIssue["code"], path: string, message: string): ViraExperiencePackCompositionResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}
function parsePolicyTemplate(input: JsonValue): ViraExperiencePackPolicyTemplate | undefined {
  if (!object(input) || Object.keys(input).sort().join("\0") !== "id\0policyRef\0provider") return undefined;
  if (typeof input.id !== "string" || !isSemanticNamespace(input.id)) return undefined;
  if (typeof input.provider !== "string" || !isSemanticNamespace(input.provider)) return undefined;
  if (typeof input.policyRef !== "string" || !POLICY_REF.test(input.policyRef)) return undefined;
  return Object.freeze({ id: input.id, provider: input.provider, policyRef: input.policyRef });
}

export function parseViraExperiencePackComposition(input: unknown): ViraExperiencePackCompositionResult {
  const parsed = parseJsonValue(input, "$" );
  if (!parsed.ok || !object(parsed.value)) return failure("INVALID_COMPOSITION", "$", "Experience Pack composition must be canonical JSON");
  if (Object.keys(parsed.value).sort().join("\0") !== "document\0domain\0id\0policyTemplates\0version") {
    return failure("INVALID_COMPOSITION", "$", "Experience Pack composition has an invalid exact shape");
  }
  if (
    parsed.value.version !== VIRA_EXPERIENCE_PACK_COMPOSITION_VERSION
    || typeof parsed.value.id !== "string" || !isSemanticNamespace(parsed.value.id)
    || typeof parsed.value.domain !== "string" || !isSemanticNamespace(parsed.value.domain)
  ) return failure("INVALID_COMPOSITION", "$", "Experience Pack composition identity is invalid");

  const documentResult = parseStudioExperienceDocument(parsed.value.document);
  if (!documentResult.ok) return failure("INVALID_DOCUMENT", "$.document", "Experience Pack composition document is not a canonical Studio Experience");

  if (!Array.isArray(parsed.value.policyTemplates)) return failure("INVALID_POLICY_TEMPLATE", "$.policyTemplates", "policyTemplates must be an array");
  if (parsed.value.policyTemplates.length > VIRA_EXPERIENCE_PACK_MAX_POLICY_TEMPLATES) return failure("POLICY_TEMPLATE_LIMIT_EXCEEDED", "$.policyTemplates", "too many policy templates");
  const policyTemplates: ViraExperiencePackPolicyTemplate[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < parsed.value.policyTemplates.length; index += 1) {
    const template = parsePolicyTemplate(parsed.value.policyTemplates[index] as JsonValue);
    if (!template) return failure("INVALID_POLICY_TEMPLATE", `$.policyTemplates[${index}]`, "policy template must contain only id, provider and policyRef");
    if (seen.has(template.id)) return failure("DUPLICATE_POLICY_TEMPLATE", `$.policyTemplates[${index}].id`, "policy template id is duplicated");
    seen.add(template.id);
    policyTemplates.push(template);
  }

  const value: ViraExperiencePackComposition = Object.freeze({
    version: VIRA_EXPERIENCE_PACK_COMPOSITION_VERSION,
    id: parsed.value.id,
    domain: parsed.value.domain,
    document: documentResult.value,
    policyTemplates: Object.freeze(policyTemplates),
  });
  return { ok: true, value };
}
