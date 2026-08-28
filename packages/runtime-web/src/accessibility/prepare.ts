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
  AccessibilityErrorAnnouncement,
  AccessibilityFocusOnMount,
  AccessibilityFocusOnUpdate,
  AccessibilityPolicy,
  AccessibilityStatusAnnouncement,
  AccessibilityValidationCode,
  AccessibleRenderModelResult,
} from "./types.js";

const rootFields = new Set(["composition", "plan", "componentAdapter", "accessibility"]);
const policyFields = new Set(["version", "focusOnMount", "focusOnUpdate", "statusAnnouncements", "errorAnnouncements"]);

function failure(code: AccessibilityValidationCode, path: string, message: string): AccessibleRenderModelResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function parseAccessibilityPolicy(input: unknown):
  | { readonly ok: true; readonly value: AccessibilityPolicy }
  | { readonly ok: false; readonly code: AccessibilityValidationCode; readonly path: string; readonly message: string } {
  const raw = readRuntimeWebDataObject(input, "$.accessibility");
  if (!raw.ok) return { ok: false, code: "INVALID_POLICY", path: raw.issue.path, message: "accessibility policy is invalid" };
  const fields = raw.value;
  const unknownField = Object.keys(fields).sort().find((field) => !policyFields.has(field));
  if (unknownField) {
    return { ok: false, code: "UNKNOWN_POLICY_FIELD", path: `$.accessibility.${unknownField}`, message: "accessibility policy contains an unknown field" };
  }
  if (fields.version !== ACCESSIBILITY_POLICY_VERSION) {
    return { ok: false, code: "INVALID_POLICY_VERSION", path: "$.accessibility.version", message: "accessibility policy version is invalid" };
  }
  if (!oneOf(fields.focusOnMount, ACCESSIBILITY_FOCUS_ON_MOUNT)) {
    return { ok: false, code: "INVALID_FOCUS_ON_MOUNT", path: "$.accessibility.focusOnMount", message: "focusOnMount is invalid" };
  }
  if (!oneOf(fields.focusOnUpdate, ACCESSIBILITY_FOCUS_ON_UPDATE)) {
    return { ok: false, code: "INVALID_FOCUS_ON_UPDATE", path: "$.accessibility.focusOnUpdate", message: "focusOnUpdate is invalid" };
  }
  if (!oneOf(fields.statusAnnouncements, ACCESSIBILITY_STATUS_ANNOUNCEMENTS)) {
    return { ok: false, code: "INVALID_STATUS_ANNOUNCEMENTS", path: "$.accessibility.statusAnnouncements", message: "statusAnnouncements is invalid" };
  }
  if (!oneOf(fields.errorAnnouncements, ACCESSIBILITY_ERROR_ANNOUNCEMENTS)) {
    return { ok: false, code: "INVALID_ERROR_ANNOUNCEMENTS", path: "$.accessibility.errorAnnouncements", message: "errorAnnouncements must remain polite or assertive" };
  }

  return {
    ok: true,
    value: freezeRuntimeWebData({
      version: ACCESSIBILITY_POLICY_VERSION,
      focusOnMount: fields.focusOnMount as AccessibilityFocusOnMount,
      focusOnUpdate: fields.focusOnUpdate as AccessibilityFocusOnUpdate,
      statusAnnouncements: fields.statusAnnouncements as AccessibilityStatusAnnouncement,
      errorAnnouncements: fields.errorAnnouncements as AccessibilityErrorAnnouncement,
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

  const accessibility = parseAccessibilityPolicy(fields.accessibility);
  if (!accessibility.ok) return failure(accessibility.code, accessibility.path, accessibility.message);

  return {
    ok: true,
    value: freezeRuntimeWebData({
      render: render.value,
      accessibility: accessibility.value,
    }),
  };
}
