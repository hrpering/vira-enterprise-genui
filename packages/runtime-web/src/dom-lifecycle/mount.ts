import {
  createCapabilityAllowlistPolicy,
  createComponentAllowlistPolicy,
  evaluateCapabilityAllowlist,
  evaluateComponentAllowlist,
} from "@vira-enterprise-genui/security";
import { prepareAccessibleRenderModel } from "../accessibility/index.js";
import { readRuntimeWebDataObject } from "../internal/data-object-input.js";
import { createResponsivePolicy, resolveResponsiveBand } from "../responsive/index.js";
import type {
  RuntimeWebDomComponentHandle,
  RuntimeWebDomPort,
  RuntimeWebDomRoot,
  RuntimeWebMountResult,
  RuntimeWebMountValidationCode,
} from "./types.js";

const inputFields = new Set([
  "composition",
  "plan",
  "componentAdapter",
  "capabilityAllowlist",
  "componentAllowlist",
  "accessibility",
  "responsive",
]);

function failure(code: RuntimeWebMountValidationCode, path: string, message: string): RuntimeWebMountResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function safeDispose(handle: { dispose(): void }): void {
  try {
    handle.dispose();
  } catch {
    // Cleanup is best effort; later handles/root must still be attempted.
  }
}

function rollback(root: RuntimeWebDomRoot | undefined, components: readonly RuntimeWebDomComponentHandle[]): void {
  for (let index = components.length - 1; index >= 0; index -= 1) {
    const handle = components[index];
    if (handle) safeDispose(handle);
  }
  if (root) safeDispose(root);
}

export function mountExperience(input: unknown, domPort: RuntimeWebDomPort): RuntimeWebMountResult {
  const raw = readRuntimeWebDataObject(input);
  if (!raw.ok) return failure("INVALID_MOUNT_INPUT", raw.issue.path, "DOM mount input is invalid");
  const fields = raw.value;
  const unknownField = Object.keys(fields).sort().find((field) => !inputFields.has(field));
  if (unknownField) return failure("INVALID_MOUNT_INPUT", `$.${unknownField}`, "DOM mount input contains an unknown field");

  const prepared = prepareAccessibleRenderModel({
    composition: fields.composition,
    plan: fields.plan,
    componentAdapter: fields.componentAdapter,
    accessibility: fields.accessibility,
  });
  if (!prepared.ok) return failure("INVALID_RENDER_INPUT", prepared.issue.path, "render/accessibility preparation failed");

  const capabilityAllowlist = createCapabilityAllowlistPolicy(fields.capabilityAllowlist);
  if (!capabilityAllowlist.ok) {
    return failure(
      "INVALID_CAPABILITY_ALLOWLIST",
      nestedPath("$.capabilityAllowlist", capabilityAllowlist.issue.path),
      "capability allowlist policy is invalid",
    );
  }

  const render = prepared.value.render;
  for (let regionIndex = 0; regionIndex < render.regions.length; regionIndex += 1) {
    const region = render.regions[regionIndex];
    if (!region) continue;
    for (let bindingIndex = 0; bindingIndex < region.bindings.length; bindingIndex += 1) {
      const binding = region.bindings[bindingIndex];
      if (!binding) continue;
      const decision = evaluateCapabilityAllowlist(capabilityAllowlist.value, binding.capability.id);
      if (!decision.ok) {
        return failure(
          "INVALID_CAPABILITY_ALLOWLIST",
          nestedPath("$.capabilityAllowlist", decision.issue.path),
          "capability allowlist evaluation failed",
        );
      }
      if (decision.value.decision === "deny") {
        return failure(
          "CAPABILITY_DENIED",
          `$.render.regions[${regionIndex}].bindings[${bindingIndex}].capability.id`,
          "render capability is not authorized by the configured allowlist",
        );
      }
    }
  }

  const componentAllowlist = createComponentAllowlistPolicy(fields.componentAllowlist);
  if (!componentAllowlist.ok) {
    return failure(
      "INVALID_COMPONENT_ALLOWLIST",
      nestedPath("$.componentAllowlist", componentAllowlist.issue.path),
      "component allowlist policy is invalid",
    );
  }

  for (let regionIndex = 0; regionIndex < render.regions.length; regionIndex += 1) {
    const region = render.regions[regionIndex];
    if (!region) continue;
    for (let bindingIndex = 0; bindingIndex < region.bindings.length; bindingIndex += 1) {
      const binding = region.bindings[bindingIndex];
      if (!binding) continue;
      const decision = evaluateComponentAllowlist(componentAllowlist.value, binding.component);
      if (!decision.ok) {
        return failure(
          "INVALID_COMPONENT_ALLOWLIST",
          nestedPath("$.componentAllowlist", decision.issue.path),
          "component allowlist evaluation failed",
        );
      }
      if (decision.value.decision === "deny") {
        return failure(
          "COMPONENT_DENIED",
          `$.render.regions[${regionIndex}].bindings[${bindingIndex}].component`,
          "resolved render component is not authorized by the configured allowlist",
        );
      }
    }
  }

  const responsive = createResponsivePolicy(fields.responsive);
  if (!responsive.ok) {
    return failure("INVALID_RESPONSIVE_POLICY", nestedPath("$.responsive", responsive.issue.path), "responsive policy is invalid");
  }

  let inlineSizePx: number;
  try {
    inlineSizePx = domPort.measureContainerInlineSizePx();
  } catch {
    return failure("CONTAINER_MEASURE_FAILED", "$.container.inlineSizePx", "DOM host failed to measure container inline size");
  }

  const responsiveBand = resolveResponsiveBand(responsive.value, inlineSizePx);
  if (!responsiveBand.ok) {
    return failure("CONTAINER_MEASURE_FAILED", "$.container.inlineSizePx", "DOM host returned an invalid container inline size");
  }

  const components: RuntimeWebDomComponentHandle[] = [];
  let root: RuntimeWebDomRoot | undefined;

  try {
    root = domPort.begin({
      planId: render.planId,
      mode: render.mode,
      layout: render.layout,
      disclosure: render.disclosure,
      accessibility: prepared.value.accessibility,
      responsiveBand: responsiveBand.value,
    });
  } catch {
    return failure("DOM_BEGIN_FAILED", "$", "DOM host failed to begin experience mount");
  }

  try {
    for (const region of render.regions) {
      const domRegion = root.createRegion(region);
      for (const binding of region.bindings) components.push(domRegion.mountComponent(binding));
    }
    root.commit();
  } catch {
    rollback(root, components);
    return failure("DOM_MOUNT_FAILED", "$", "DOM host failed while mounting experience");
  }

  let disposed = false;
  return {
    ok: true,
    value: Object.freeze({
      planId: render.planId,
      dispose(): void {
        if (disposed) return;
        disposed = true;
        rollback(root, components);
      },
    }),
  };
}
