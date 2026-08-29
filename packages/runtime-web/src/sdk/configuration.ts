import {
  createActionAdapterContract,
  createComponentAdapterContract,
} from "@vira-enterprise-genui/adapter-sdk";
import { createRuntimePermissionPolicy } from "@vira-enterprise-genui/runtime-core";
import {
  createCapabilityAllowlistPolicy,
  createComponentAllowlistPolicy,
} from "@vira-enterprise-genui/security";
import { createAccessibilityPolicy } from "../accessibility/index.js";
import type {
  RuntimeWebDomBeginContext,
  RuntimeWebDomPort,
  RuntimeWebDomRoot,
} from "../dom-lifecycle/index.js";
import type { RuntimeWebActionIdFactory } from "../events/index.js";
import { readRuntimeWebDataObject } from "../internal/data-object-input.js";
import { createResponsivePolicy } from "../responsive/index.js";
import type {
  WebSdkConfigurationResult,
  WebSdkConfigurationValidationCode,
} from "./types.js";

const inputFields = new Set([
  "componentAdapter",
  "actionAdapter",
  "permissionPolicy",
  "capabilityAllowlist",
  "componentAllowlist",
  "accessibility",
  "responsive",
  "domPort",
  "idFactory",
]);
const TRUSTED_METHOD_PROTOTYPE_DEPTH_LIMIT = 64;
type TrustedMethod = (...args: unknown[]) => unknown;

function failure(
  code: WebSdkConfigurationValidationCode,
  path: string,
  message: string,
): WebSdkConfigurationResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function findDataMethod(value: unknown, name: string): TrustedMethod | undefined {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return undefined;
  const visited = new Set<object>();
  let current: object | null = value as object;
  let depth = 0;

  try {
    while (current !== null) {
      if (visited.has(current) || depth >= TRUSTED_METHOD_PROTOTYPE_DEPTH_LIMIT) return undefined;
      visited.add(current);
      depth += 1;

      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (descriptor) {
        if (!("value" in descriptor) || typeof descriptor.value !== "function") return undefined;
        return descriptor.value as TrustedMethod;
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function createTrustedDomPort(input: unknown): RuntimeWebDomPort | undefined {
  const measure = findDataMethod(input, "measureContainerInlineSizePx");
  const begin = findDataMethod(input, "begin");
  if (!measure || !begin) return undefined;
  return Object.freeze({
    measureContainerInlineSizePx(): number {
      return measure.call(input) as number;
    },
    begin(context: RuntimeWebDomBeginContext): RuntimeWebDomRoot {
      return begin.call(input, context) as RuntimeWebDomRoot;
    },
  });
}

function createTrustedIdFactory(input: unknown): RuntimeWebActionIdFactory | undefined {
  const nextId = findDataMethod(input, "nextId");
  if (!nextId) return undefined;
  return Object.freeze({
    nextId(): string {
      return nextId.call(input) as string;
    },
  });
}

export function createWebSdkConfiguration(input: unknown): WebSdkConfigurationResult {
  const root = readRuntimeWebDataObject(input);
  if (!root.ok) return failure("INVALID_INPUT", root.issue.path, "Web SDK configuration input is invalid");
  const fields = root.value;
  const unknownField = Object.keys(fields).sort().find((field) => !inputFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, "Web SDK configuration contains an unknown field");

  const componentAdapter = createComponentAdapterContract(fields.componentAdapter);
  if (!componentAdapter.ok) {
    return failure("INVALID_COMPONENT_ADAPTER", nestedPath("$.componentAdapter", componentAdapter.issue.path), componentAdapter.issue.message);
  }

  const actionAdapter = createActionAdapterContract(fields.actionAdapter);
  if (!actionAdapter.ok) {
    return failure("INVALID_ACTION_ADAPTER", nestedPath("$.actionAdapter", actionAdapter.issue.path), actionAdapter.issue.message);
  }

  const permissionPolicy = createRuntimePermissionPolicy(fields.permissionPolicy);
  if (!permissionPolicy.ok) {
    return failure("INVALID_PERMISSION_POLICY", nestedPath("$.permissionPolicy", permissionPolicy.issue.path), "runtime permission policy is invalid");
  }

  const capabilityAllowlist = createCapabilityAllowlistPolicy(fields.capabilityAllowlist);
  if (!capabilityAllowlist.ok) {
    return failure(
      "INVALID_CAPABILITY_ALLOWLIST",
      nestedPath("$.capabilityAllowlist", capabilityAllowlist.issue.path),
      "capability allowlist policy is invalid",
    );
  }

  const componentAllowlist = createComponentAllowlistPolicy(fields.componentAllowlist);
  if (!componentAllowlist.ok) {
    return failure(
      "INVALID_COMPONENT_ALLOWLIST",
      nestedPath("$.componentAllowlist", componentAllowlist.issue.path),
      "component allowlist policy is invalid",
    );
  }

  const accessibility = createAccessibilityPolicy(fields.accessibility);
  if (!accessibility.ok) {
    return failure("INVALID_ACCESSIBILITY_POLICY", nestedPath("$.accessibility", accessibility.issue.path), accessibility.issue.message);
  }

  const responsive = createResponsivePolicy(fields.responsive);
  if (!responsive.ok) {
    return failure("INVALID_RESPONSIVE_POLICY", nestedPath("$.responsive", responsive.issue.path), responsive.issue.message);
  }

  const domPort = createTrustedDomPort(fields.domPort);
  if (!domPort) return failure("INVALID_DOM_PORT", "$.domPort", "DOM Port must provide trusted data-method implementations");

  const idFactory = createTrustedIdFactory(fields.idFactory);
  if (!idFactory) return failure("INVALID_ID_FACTORY", "$.idFactory", "Action ID Factory must provide a trusted nextId data method");

  return {
    ok: true,
    value: Object.freeze({
      componentAdapter: componentAdapter.value,
      actionAdapter: actionAdapter.value,
      permissionPolicy: permissionPolicy.value,
      capabilityAllowlist: capabilityAllowlist.value,
      componentAllowlist: componentAllowlist.value,
      accessibility: accessibility.value,
      responsive: responsive.value,
      domPort,
      idFactory,
    }),
  };
}
