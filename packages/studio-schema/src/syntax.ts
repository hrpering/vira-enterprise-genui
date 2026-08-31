import {
  SEMANTIC_SEGMENT_MAX_LENGTH,
  isSemanticNamespace,
} from "@vira-enterprise-genui/protocol";

export const STUDIO_SCOPE_ROOT = "currentItem" as const;

const studioPayloadKeyPattern = /^[a-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;

export function isStudioScopePath(value: string): boolean {
  const prefix = `${STUDIO_SCOPE_ROOT}.`;
  return value.startsWith(prefix)
    && isSemanticNamespace(value.slice(prefix.length));
}

export function isStudioPayloadKey(value: string): boolean {
  return value.length >= 1
    && value.length <= SEMANTIC_SEGMENT_MAX_LENGTH
    && studioPayloadKeyPattern.test(value);
}
