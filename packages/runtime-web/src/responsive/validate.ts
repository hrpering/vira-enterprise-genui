import { isSemanticSegment } from "@vira-enterprise-genui/protocol";
import { freezeRuntimeWebData } from "../internal/freeze.js";
import { readRuntimeWebDataObject } from "../internal/data-object-input.js";
import {
  RESPONSIVE_MAX_BANDS,
  RESPONSIVE_MAX_THRESHOLD_PX,
  RESPONSIVE_POLICY_STRATEGY,
  RESPONSIVE_POLICY_VERSION,
} from "./types.js";
import type {
  ResponsiveBand,
  ResponsiveBandResolutionResult,
  ResponsivePolicyResult,
  ResponsiveValidationCode,
} from "./types.js";

const policyFields = new Set(["version", "strategy", "bands"]);
const bandFields = new Set(["id", "minInlineSizePx"]);

function failure(code: ResponsiveValidationCode, path: string, message: string): ResponsivePolicyResult {
  return { ok: false, issue: { code, path, message } };
}

function resolutionFailure(code: ResponsiveValidationCode, path: string, message: string): ResponsiveBandResolutionResult {
  return { ok: false, issue: { code, path, message } };
}

function preflightBands(input: unknown): ResponsivePolicyResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, "bands");
  if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) return undefined;
  if (descriptor.value.length > RESPONSIVE_MAX_BANDS) {
    return failure("BAND_LIMIT_EXCEEDED", "$.bands", `responsive policy may declare at most ${RESPONSIVE_MAX_BANDS} bands`);
  }
  return undefined;
}

export function createResponsivePolicy(input: unknown): ResponsivePolicyResult {
  const preflight = preflightBands(input);
  if (preflight) return preflight;

  const root = readRuntimeWebDataObject(input);
  if (!root.ok) return failure("INVALID_INPUT", root.issue.path, "responsive policy input is invalid");
  const fields = root.value;
  const unknownField = Object.keys(fields).sort().find((field) => !policyFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, "responsive policy contains an unknown field");
  if (fields.version !== RESPONSIVE_POLICY_VERSION) return failure("INVALID_VERSION", "$.version", "responsive policy version is invalid");
  if (fields.strategy !== RESPONSIVE_POLICY_STRATEGY) return failure("INVALID_STRATEGY", "$.strategy", "responsive strategy must be container");
  if (!Array.isArray(fields.bands) || fields.bands.length === 0) return failure("INVALID_BANDS", "$.bands", "bands must be a non-empty array");
  if (fields.bands.length > RESPONSIVE_MAX_BANDS) return failure("BAND_LIMIT_EXCEEDED", "$.bands", `responsive policy may declare at most ${RESPONSIVE_MAX_BANDS} bands`);

  const bands: ResponsiveBand[] = [];
  const ids = new Set<string>();
  let previousThreshold = -1;

  for (let index = 0; index < fields.bands.length; index += 1) {
    const rawBand = readRuntimeWebDataObject(fields.bands[index], `$.bands[${index}]`);
    if (!rawBand.ok) return failure("INVALID_BAND", rawBand.issue.path, "responsive band is invalid");
    const band = rawBand.value;
    const unknownBandField = Object.keys(band).sort().find((field) => !bandFields.has(field));
    if (unknownBandField) return failure("INVALID_BAND", `$.bands[${index}].${unknownBandField}`, "responsive band contains an unknown field");
    if (typeof band.id !== "string" || !isSemanticSegment(band.id)) return failure("INVALID_BAND", `$.bands[${index}].id`, "responsive band id must be a semantic segment");
    if (ids.has(band.id)) return failure("DUPLICATE_BAND_ID", `$.bands[${index}].id`, "responsive band id is duplicated");
    if (
      typeof band.minInlineSizePx !== "number"
      || !Number.isSafeInteger(band.minInlineSizePx)
      || band.minInlineSizePx < 0
      || band.minInlineSizePx > RESPONSIVE_MAX_THRESHOLD_PX
    ) {
      return failure("INVALID_BAND", `$.bands[${index}].minInlineSizePx`, "responsive band threshold must be a bounded non-negative integer pixel value");
    }
    if (index === 0 && band.minInlineSizePx !== 0) {
      return failure("INVALID_THRESHOLD_ORDER", `$.bands[${index}].minInlineSizePx`, "first responsive band must begin at zero");
    }
    if (band.minInlineSizePx <= previousThreshold) {
      return failure("INVALID_THRESHOLD_ORDER", `$.bands[${index}].minInlineSizePx`, "responsive band thresholds must be strictly increasing");
    }

    ids.add(band.id);
    previousThreshold = band.minInlineSizePx;
    bands.push({ id: band.id, minInlineSizePx: band.minInlineSizePx });
  }

  return {
    ok: true,
    value: freezeRuntimeWebData({ version: RESPONSIVE_POLICY_VERSION, strategy: RESPONSIVE_POLICY_STRATEGY, bands }),
  };
}

export function resolveResponsiveBand(policyInput: unknown, inlineSizePx: unknown): ResponsiveBandResolutionResult {
  const policy = createResponsivePolicy(policyInput);
  if (!policy.ok) return policy;
  if (
    typeof inlineSizePx !== "number"
    || !Number.isFinite(inlineSizePx)
    || inlineSizePx < 0
    || inlineSizePx > RESPONSIVE_MAX_THRESHOLD_PX
  ) {
    return resolutionFailure("INVALID_CONTAINER_SIZE", "$.inlineSizePx", "container inline size must be a bounded non-negative finite number");
  }

  let selected = policy.value.bands[0];
  if (!selected) return resolutionFailure("INVALID_BANDS", "$.bands", "responsive policy has no bands");
  for (const band of policy.value.bands) {
    if (inlineSizePx < band.minInlineSizePx) break;
    selected = band;
  }
  return { ok: true, value: selected };
}
