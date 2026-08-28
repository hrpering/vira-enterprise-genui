import { createComponentAdapterContract } from "@vira-enterprise-genui/adapter-sdk";
import { validateComposedExperienceAgainstPlan } from "@vira-enterprise-genui/composer";
import { freezeRuntimeWebData } from "../internal/freeze.js";
import { readRuntimeWebDataObject } from "../internal/data-object-input.js";
import type {
  RenderCapabilityBinding,
  RenderModelRegion,
  RenderModelResult,
  RenderModelValidationCode,
} from "./types.js";

const inputFields = new Set(["composition", "plan", "componentAdapter"]);

function failure(code: RenderModelValidationCode, path: string, message: string): RenderModelResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

export function prepareRenderModel(input: unknown): RenderModelResult {
  const root = readRuntimeWebDataObject(input);
  if (!root.ok) return failure("INVALID_INPUT", root.issue.path, root.issue.reason);
  const fields = root.value;

  const unknownField = Object.keys(fields).sort().find((field) => !inputFields.has(field));
  if (unknownField) return failure("INVALID_INPUT", `$.${unknownField}`, `unknown render model input field: ${unknownField}`);

  const composition = validateComposedExperienceAgainstPlan(fields.composition, fields.plan);
  if (!composition.ok) return failure("INVALID_COMPOSITION", nestedPath("$.composition", composition.issue.path), composition.issue.message);

  const componentAdapter = createComponentAdapterContract(fields.componentAdapter);
  if (!componentAdapter.ok) {
    return failure("INVALID_COMPONENT_ADAPTER", nestedPath("$.componentAdapter", componentAdapter.issue.path), componentAdapter.issue.message);
  }

  const componentByCapability = new Map<string, string>();
  for (const mapping of componentAdapter.value.mappings) {
    componentByCapability.set(mapping.capability.id, mapping.component);
  }

  const regions: RenderModelRegion[] = [];
  for (let regionIndex = 0; regionIndex < composition.value.regions.length; regionIndex += 1) {
    const region = composition.value.regions[regionIndex];
    if (!region) continue;
    const bindings: RenderCapabilityBinding[] = [];
    for (let capabilityIndex = 0; capabilityIndex < region.capabilities.length; capabilityIndex += 1) {
      const capability = region.capabilities[capabilityIndex];
      if (!capability) continue;
      const component = componentByCapability.get(capability.id);
      if (component === undefined) {
        return failure(
          "UNMAPPED_COMPONENT",
          `$.composition.regions[${regionIndex}].capabilities[${capabilityIndex}]`,
          "no exact semantic component mapping exists for composed capability",
        );
      }
      bindings.push({ capability, component });
    }
    regions.push({ id: region.id, role: region.role, bindings });
  }

  return {
    ok: true,
    value: freezeRuntimeWebData({
      planId: composition.value.planId,
      mode: composition.value.mode,
      layout: composition.value.layout,
      disclosure: composition.value.disclosure,
      regions,
    }),
  };
}
