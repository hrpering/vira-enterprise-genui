import type { RenderModel } from "../renderer/index.js";

export const ACCESSIBILITY_POLICY_VERSION = "1" as const;
export const ACCESSIBILITY_FOCUS_ON_MOUNT = Object.freeze(["preserve-host", "first-primary"] as const);
export const ACCESSIBILITY_FOCUS_ON_UPDATE = Object.freeze(["preserve", "primary-if-lost"] as const);
export const ACCESSIBILITY_STATUS_ANNOUNCEMENTS = Object.freeze(["off", "polite"] as const);
export const ACCESSIBILITY_ERROR_ANNOUNCEMENTS = Object.freeze(["polite", "assertive"] as const);

export type AccessibilityFocusOnMount = (typeof ACCESSIBILITY_FOCUS_ON_MOUNT)[number];
export type AccessibilityFocusOnUpdate = (typeof ACCESSIBILITY_FOCUS_ON_UPDATE)[number];
export type AccessibilityStatusAnnouncement = (typeof ACCESSIBILITY_STATUS_ANNOUNCEMENTS)[number];
export type AccessibilityErrorAnnouncement = (typeof ACCESSIBILITY_ERROR_ANNOUNCEMENTS)[number];

export interface AccessibilityPolicy {
  readonly version: typeof ACCESSIBILITY_POLICY_VERSION;
  readonly focusOnMount: AccessibilityFocusOnMount;
  readonly focusOnUpdate: AccessibilityFocusOnUpdate;
  readonly statusAnnouncements: AccessibilityStatusAnnouncement;
  readonly errorAnnouncements: AccessibilityErrorAnnouncement;
}

export interface AccessibleRenderModel {
  readonly render: RenderModel;
  readonly accessibility: AccessibilityPolicy;
}

export type AccessibilityValidationCode =
  | "INVALID_INPUT"
  | "INVALID_RENDER_MODEL"
  | "INVALID_POLICY"
  | "UNKNOWN_POLICY_FIELD"
  | "INVALID_POLICY_VERSION"
  | "INVALID_FOCUS_ON_MOUNT"
  | "INVALID_FOCUS_ON_UPDATE"
  | "INVALID_STATUS_ANNOUNCEMENTS"
  | "INVALID_ERROR_ANNOUNCEMENTS";

export interface AccessibilityValidationIssue {
  readonly code: AccessibilityValidationCode;
  readonly path: string;
  readonly message: string;
}

export type AccessibleRenderModelResult =
  | { readonly ok: true; readonly value: AccessibleRenderModel }
  | { readonly ok: false; readonly issue: AccessibilityValidationIssue };
