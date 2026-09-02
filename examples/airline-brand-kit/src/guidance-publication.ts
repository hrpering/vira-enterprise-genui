import { parseExperiencePackManifest } from "@vira-enterprise-genui/experience-packs";
import {
  prepareAuthoredStudioPublication,
  type StudioAuthoringDocumentInput,
} from "@vira-enterprise-genui/genui";

export const AIRLINE_GUIDANCE_PACK_ID = "vira/airline-guidance" as const;
export const AIRLINE_GUIDANCE_PACK_VERSION = "1.0.0" as const;
export const AIRLINE_GUIDANCE_ENTRYPOINT = "guidance" as const;
// Working metadata is pinned by GENUI-126 artifact-parity tests before the review branch is created.
export const AIRLINE_GUIDANCE_ARTIFACT_DIGEST = `sha256:${"0".repeat(64)}` as const;
export const AIRLINE_GUIDANCE_ARTIFACT_SIZE = 1 as const;

export const AIRLINE_GUIDANCE_COMPONENT = "airline.guidance.card" as const;

const stringPayload = (key: string, label: string) => Object.freeze({ key, type: "string" as const, required: true, label });

export const AIRLINE_GUIDANCE_COMPONENT_CATALOG = Object.freeze({
  version: "1" as const,
  id: "airline.guidance.components",
  brandId: "airline.brand",
  components: Object.freeze([
    Object.freeze({
      ref: AIRLINE_GUIDANCE_COMPONENT,
      label: "Airline guidance",
      category: "airline.guidance",
      kind: "content",
      props: Object.freeze([
        Object.freeze({
          key: "guidanceType",
          type: "enum" as const,
          required: true,
          bindable: true,
          options: Object.freeze([
            "advisory.special-assistance",
            "policy.missed-flight",
            "compliance.visa-check",
          ]),
        }),
        Object.freeze({ key: "assistanceType", type: "string" as const, required: false, bindable: true }),
        Object.freeze({ key: "policyScenario", type: "string" as const, required: false, bindable: true }),
        Object.freeze({
          key: "visaStatus",
          type: "enum" as const,
          required: true,
          bindable: true,
          options: Object.freeze(["collecting", "official-check-required"]),
        }),
        Object.freeze({ key: "nationality", type: "string" as const, required: false, bindable: true }),
        Object.freeze({ key: "passportIssuer", type: "string" as const, required: false, bindable: true }),
        Object.freeze({ key: "residence", type: "string" as const, required: false, bindable: true }),
        Object.freeze({ key: "handoff", type: "string" as const, required: false, bindable: true }),
      ]),
      slots: Object.freeze([]),
      events: Object.freeze([
        Object.freeze({
          name: "assistance-select",
          label: "Select assistance",
          payload: Object.freeze([stringPayload("assistanceType", "Assistance type")]),
        }),
        Object.freeze({
          name: "policy-select",
          label: "Select policy scenario",
          payload: Object.freeze([stringPayload("scenario", "Policy scenario")]),
        }),
        Object.freeze({
          name: "visa-submit",
          label: "Submit visa profile",
          payload: Object.freeze([
            stringPayload("nationality", "Nationality"),
            stringPayload("passportIssuer", "Passport issuer"),
            stringPayload("residence", "Residence"),
          ]),
        }),
        Object.freeze({
          name: "handoff",
          label: "Request guidance handoff",
          payload: Object.freeze([stringPayload("kind", "Handoff kind")]),
        }),
      ]),
    }),
  ]),
});

export const AIRLINE_GUIDANCE_BINDING_SOURCE_CATALOG = Object.freeze({
  version: "1" as const,
  id: "airline.guidance.state",
  sources: Object.freeze([
    Object.freeze({ kind: "state" as const, path: "guidance-type", label: "Guidance type", valueType: "enum" as const }),
    Object.freeze({ kind: "state" as const, path: "assistance-type", label: "Assistance type", valueType: "string" as const }),
    Object.freeze({ kind: "state" as const, path: "policy-scenario", label: "Policy scenario", valueType: "string" as const }),
    Object.freeze({ kind: "state" as const, path: "visa-status", label: "Visa status", valueType: "enum" as const }),
    Object.freeze({ kind: "state" as const, path: "nationality", label: "Nationality", valueType: "string" as const }),
    Object.freeze({ kind: "state" as const, path: "passport-issuer", label: "Passport issuer", valueType: "string" as const }),
    Object.freeze({ kind: "state" as const, path: "residence", label: "Residence", valueType: "string" as const }),
    Object.freeze({ kind: "state" as const, path: "guidance-handoff", label: "Guidance handoff", valueType: "string" as const }),
  ]),
});

export const AIRLINE_GUIDANCE_ACTION_ADAPTER = Object.freeze({
  version: "1" as const,
  id: "airline.guidance.actions",
  mappings: Object.freeze([
    Object.freeze({ event: "guidance.assistance.select", actionType: "travel.guidance.assistance.select" }),
    Object.freeze({ event: "guidance.policy.select", actionType: "travel.guidance.policy.select" }),
    Object.freeze({ event: "guidance.visa.submit", actionType: "travel.guidance.visa.submit" }),
    Object.freeze({ event: "guidance.handoff", actionType: "travel.guidance.handoff" }),
  ]),
});

export const AIRLINE_GUIDANCE_PERMISSION_POLICY = Object.freeze({
  version: "1" as const,
  rules: Object.freeze(AIRLINE_GUIDANCE_ACTION_ADAPTER.mappings.map((mapping) => Object.freeze({
    subject: "action" as const,
    id: mapping.actionType,
    effect: "allow" as const,
  }))),
});

const document: StudioAuthoringDocumentInput = {
  id: "vira.airline-guidance.publication",
  recipeId: "studio.airline.guidance",
  entryView: "main",
  views: [{
    id: "main",
    nodes: [{ id: "guidance", component: AIRLINE_GUIDANCE_COMPONENT, order: 0, props: {} }],
  }],
  bindings: [
    { viewId: "main", nodeId: "guidance", prop: "guidanceType", source: { kind: "state", path: "guidance-type" } },
    { viewId: "main", nodeId: "guidance", prop: "assistanceType", source: { kind: "state", path: "assistance-type" } },
    { viewId: "main", nodeId: "guidance", prop: "policyScenario", source: { kind: "state", path: "policy-scenario" } },
    { viewId: "main", nodeId: "guidance", prop: "visaStatus", source: { kind: "state", path: "visa-status" } },
    { viewId: "main", nodeId: "guidance", prop: "nationality", source: { kind: "state", path: "nationality" } },
    { viewId: "main", nodeId: "guidance", prop: "passportIssuer", source: { kind: "state", path: "passport-issuer" } },
    { viewId: "main", nodeId: "guidance", prop: "residence", source: { kind: "state", path: "residence" } },
    { viewId: "main", nodeId: "guidance", prop: "handoff", source: { kind: "state", path: "guidance-handoff" } },
  ],
  interactions: [
    { viewId: "main", nodeId: "guidance", event: "assistance-select", actionEvent: "guidance.assistance.select", routes: [{ outcome: "success", viewId: "main" }] },
    { viewId: "main", nodeId: "guidance", event: "policy-select", actionEvent: "guidance.policy.select", routes: [{ outcome: "success", viewId: "main" }] },
    { viewId: "main", nodeId: "guidance", event: "visa-submit", actionEvent: "guidance.visa.submit", routes: [{ outcome: "success", viewId: "main" }] },
    { viewId: "main", nodeId: "guidance", event: "handoff", actionEvent: "guidance.handoff", routes: [{ outcome: "success", viewId: "main" }] },
  ],
};

const publication = prepareAuthoredStudioPublication({
  document,
  componentCatalog: AIRLINE_GUIDANCE_COMPONENT_CATALOG,
  bindingSourceCatalog: AIRLINE_GUIDANCE_BINDING_SOURCE_CATALOG,
  actionAdapter: AIRLINE_GUIDANCE_ACTION_ADAPTER,
});
if (!publication.ok) {
  throw new Error(`Invalid airline guidance publication: ${publication.issue.path}: ${publication.issue.message}`);
}
export const AIRLINE_GUIDANCE_PUBLICATION = publication.value;

const pack = parseExperiencePackManifest({
  schemaVersion: "1",
  id: AIRLINE_GUIDANCE_PACK_ID,
  version: AIRLINE_GUIDANCE_PACK_VERSION,
  publisher: { id: "vira", name: "Vira" },
  metadata: {
    name: "Airline Guidance",
    description: "Interactive airline assistance, missed-flight policy, and visa guidance.",
    tags: ["travel", "guidance"],
  },
  compatibility: { minViraVersion: "0.0.0" },
  entrypoints: [AIRLINE_GUIDANCE_ENTRYPOINT],
  artifacts: [{
    id: AIRLINE_GUIDANCE_ENTRYPOINT,
    role: "studio-publication",
    mediaType: "application/json",
    digest: AIRLINE_GUIDANCE_ARTIFACT_DIGEST,
    size: AIRLINE_GUIDANCE_ARTIFACT_SIZE,
  }],
});
if (!pack.ok) throw new Error(`Invalid airline guidance Experience Pack: ${pack.issue.path}: ${pack.issue.message}`);
export const AIRLINE_GUIDANCE_PACK_MANIFEST = pack.value;
