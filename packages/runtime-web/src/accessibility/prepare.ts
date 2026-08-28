import { freezeRuntimeWebData } from "../internal/freeze.js";
import { readRuntimeWebDataObject } from "../internal/data-object-input.js";
import { prepareRenderModel } from "../renderer/index.js";
import {
  ACCESSIBILITY_ERROR_ANNOUNCEMENTS,
  ACCESSIBILITY_FOCUS_ON_MOUNT,
  ACCESSIBILITY_FOCUS_ON_UPDATE,
  ACCESSIBILITY_POLICY_VERSION,
  ACCESSIBILITY_STATUS_ANNOUNCEMENTS,
} from "./types.js";
import type {
  AccessibilityPolicyResult,
  AccessibilityValidationCode,
  AccessibleRenderModelResult,
} from "./types.js";

const rootFields = new Set(["composition", "plan", "componentAdapter", "accessibility"]);
const policyFields = new Set(["version", "focusOnMount", "focusOnUpdate", "statusAnnouncements", "errorAnnouncements"]);

function failure(code: AccessibilityValidationCode, path: string, message: string): AccessibleRenderModelResult {
  return { ok: false, issue: { code, path, message } };
}

function policyFailure(code: AccessibilityValidationCode, path: string, message: string): AccessibilityPolicyResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function createAccessibilityPolicy(input: unknown): AccessibilityPolicyResult {
  const raw = readRuntimeWebDataObject(input);
  if (!raw.ok) return policyFailure("INVALID_POLICY", raw.issue.path, "accessibility policy is invalid");
  const fields = raw.value;
  const unknownField = Object.keys(fields).sort().find((field) => !policyFields.has(field));
  if (unknownField) {
    return policyFailure("UNKNOWN_POLICY_FIELD", `$.${unknownField}`, "accessibility policy contains an unknown field");
  }
  if (fields.version !== ACCESSIBILITY_POLICY_VERSION) {
    return policyFailure("INVALID_POLICY_VERSION", "$.version", "accessibility policy version is invalid");
  }
  if (!oneOf(fields.focusOnMount, ACCESSIBILITY_FOCUS_ON_MOUNT)) {
    return policyFailure("INVALID_FOCUS_ON_MOUNT", "$.focusOnMount", "focusOnMount is invalid");
  }
  if (!oneOf(fields.focusOnUpdate, ACCESSIBILITY_FOCUS_ON_UPDATE)) {
    return policyFailure("INVALID_FOCUS_ON_UPDATE", "$.focusOnUpdate", "focusOnUpdate is invalid");
  }
  if (!oneOf(fields.statusAnnouncements, ACCESSIBILITY_STATUS_ANNOUNCEMENTS)) {
    return policyFailure("INVALID_STATUS_ANNOUNCEMENTS", "$.statusAnnouncements", "statusAnnouncements is invalid");
  }
  if (!oneOf(fields.errorAnnouncements, ACCESSIBILITY_ERROR_ANNOUNCEMENTS)) {
    return policyFailure("INVALID_ERROR_ANNOUNCEMENTS", "$.errorAnnouncements", "errorAnnouncements must remain polite or assertive");
  }

  return {
    ok: true,
    value: freezeRuntimeWebData({
      version: ACCESSIBILITY_POLICY_VERSION,
      focusOnMount: fields.focusOnMount,
      focusOnUpdate: fields.focusOnUpdate,
      statusAnnouncements: fields.statusAnnouncements,
      errorAnnouncements: fields.errorAnnouncements,
    }),
  };
}

export function prepareAccessibleRenderModel(input: unknown): AccessibleRenderModelResult {
  const root = readRuntimeWebDataObject(input);
  if (!root.ok) return failure("INVALID_INPUT", root.issue.path, "accessible render input is invalid");
  const fields = root.value;
  const unknownField = Object.keys(fields).sort().find((field) => !rootFields.has(field));
  if (unknownField) return failure("INVALID_INPUT", `$.${unknownField}`, "accessible render input contains an unknown field");

  const render = prepareRenderModel({
    composition: fields.composition,
    plan: fields.plan,
    componentAdapter: fields.componentAdapter,
  });
  if (!render.ok) {
    return failure("INVALID_RENDER_MODEL", nestedPath("$", render.issue.path), "render model preparation failed");
  }

  const accessibility = createAccessibilityPolicy(fields.accessibility);
  if (!accessibility.ok) {
    return failure(
      accessibility.issue.code,
      nestedPath("$.accessibility", accessibility.issue.path),
      accessibility.issue.message,
    );
  }

  return {
    ok: true,
    value: freezeRuntimeWebData({
      render: render.value,
      accessibility: accessibility.value,
    }),
  };
}
