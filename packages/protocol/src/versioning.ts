import { CAPABILITY_PROTOCOL_VERSION } from "./capability/types.js";
import { DOMAIN_DATA_PROTOCOL_VERSION } from "./domain-data/types.js";
import { EXPERIENCE_PLAN_PROTOCOL_VERSION } from "./experience-plan/types.js";
import { INTENT_PROTOCOL_VERSION } from "./intent/types.js";
import { PATCH_PROTOCOL_VERSION } from "./patch/types.js";

export const PROTOCOL_KINDS = Object.freeze([
  "intent",
  "domain-data",
  "capability",
  "experience-plan",
  "patch",
] as const);

export type ProtocolKind = (typeof PROTOCOL_KINDS)[number];

const supportedVersions: Readonly<Record<ProtocolKind, readonly string[]>> = Object.freeze({
  intent: Object.freeze([INTENT_PROTOCOL_VERSION]),
  "domain-data": Object.freeze([DOMAIN_DATA_PROTOCOL_VERSION]),
  capability: Object.freeze([CAPABILITY_PROTOCOL_VERSION]),
  "experience-plan": Object.freeze([EXPERIENCE_PLAN_PROTOCOL_VERSION]),
  patch: Object.freeze([PATCH_PROTOCOL_VERSION]),
});

export function supportedProtocolVersions(kind: ProtocolKind): readonly string[] {
  return supportedVersions[kind];
}

export function isSupportedProtocolVersion(kind: ProtocolKind, value: unknown): value is string {
  return typeof value === "string" && supportedVersions[kind].includes(value);
}
