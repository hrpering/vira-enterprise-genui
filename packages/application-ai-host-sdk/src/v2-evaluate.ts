import {
  verifyViraApplicationDistributionIntegrityV2,
  type ViraApplicationDistributionEnvelopeV2,
  type ViraApplicationDistributionV2ValidationCode,
} from "@vira-enterprise-genui/application-distribution";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import { evaluateViraApplicationForAiHost } from "./evaluate.js";
import {
  VIRA_APPLICATION_AI_HOST_SDK_V2_VERSION,
  type ViraApplicationAiHostV2Issue,
  type ViraApplicationAiHostV2Result,
} from "./v2-types.js";

const ROOT_FIELDS = new Set(["source", "host"]);

type Failure = { readonly ok: false; readonly issue: ViraApplicationAiHostV2Issue };

function failure(
  code: ViraApplicationAiHostV2Issue["code"],
  path: string,
  message: string,
  distributionCode?: ViraApplicationDistributionV2ValidationCode,
): Failure {
  return {
    ok: false,
    issue: Object.freeze({
      code,
      path,
      message,
      ...(distributionCode === undefined ? {} : { distributionCode }),
    }),
  };
}

function object(value: JsonValue | undefined): JsonObject | null {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function sourcePath(path: string): string {
  return path === "$" ? "$.source" : `$.source${path.slice(1)}`;
}

function projectApplicationV1(application: ViraApplicationDistributionEnvelopeV2["application"]): unknown {
  return {
    schemaVersion: "1",
    identity: application.identity,
    version: application.version,
    publisher: application.publisher,
    experiences: application.experiences,
    capabilities: application.capabilities,
    contextTypes: application.contextTypes,
    actions: application.actions.map((ref) => ({ actionType: ref.id })),
    flows: application.flows,
    brandRef: application.brandRef,
    governanceRequirements: application.governanceRequirements,
    hostCompatibility: application.hostCompatibility,
    protocolProjections: application.protocolProjections,
    distribution: application.distribution,
    commercial: {
      entitlementRefs: application.commercial.entitlementRefs,
      meteringRefs: application.commercial.meteringRefs,
    },
  };
}

export async function evaluateViraApplicationForAiHostV2(
  input: unknown,
  integrityVerifier: unknown,
): Promise<ViraApplicationAiHostV2Result> {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok) return failure("INVALID_INPUT", parsed.issue.path, parsed.issue.reason);
  const root = object(parsed.value);
  if (!root) return failure("INVALID_INPUT", "$", "AI-host V2 evaluation input must be an exact object");
  for (const key of Object.keys(root)) {
    if (!ROOT_FIELDS.has(key)) return failure("UNKNOWN_FIELD", `$.${key}`, "unknown AI-host V2 evaluation field");
  }
  if (!Object.hasOwn(root, "source")) return failure("INVALID_SOURCE", "$.source", "source distribution V2 envelope is required");
  if (!Object.hasOwn(root, "host")) return failure("INVALID_HOST", "$.host", "host descriptor is required");
  if (typeof integrityVerifier !== "function") {
    return failure("INVALID_INTEGRITY_VERIFIER", "$integrityVerifier", "integrity verifier must be a function");
  }

  const verified = await verifyViraApplicationDistributionIntegrityV2(root.source, integrityVerifier);
  if (!verified.ok) {
    const code = verified.issue.code;
    if (code === "INVALID_VERIFIER") {
      return failure("INVALID_INTEGRITY_VERIFIER", "$integrityVerifier", verified.issue.message, code);
    }
    if (code === "INTEGRITY_VERIFIER_FAILED") {
      return failure("SOURCE_INTEGRITY_FAILED", "$integrityVerifier", verified.issue.message, code);
    }
    if (code === "INTEGRITY_VERIFICATION_FAILED") {
      return failure("SOURCE_INTEGRITY_FAILED", sourcePath(verified.issue.path), verified.issue.message, code);
    }
    return failure("INVALID_SOURCE", sourcePath(verified.issue.path), verified.issue.message, code);
  }

  const projectedSource = {
    schemaVersion: "1",
    application: projectApplicationV1(verified.value.application),
    integrity: verified.value.integrity,
  };
  const compatibility = await evaluateViraApplicationForAiHost(
    { source: projectedSource, host: root.host },
    () => true,
  );
  if (!compatibility.ok) {
    return failure(
      compatibility.issue.code,
      compatibility.issue.path,
      compatibility.issue.message,
    );
  }

  return {
    ok: true,
    value: Object.freeze({
      sdkVersion: VIRA_APPLICATION_AI_HOST_SDK_V2_VERSION,
      source: verified.value,
      host: compatibility.value.host,
      compatibleProtocolProjections: compatibility.value.compatibleProtocolProjections,
    }),
  };
}
