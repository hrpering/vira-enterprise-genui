import { describe, expect, it } from "vitest";
import {
  CAPABILITY_PROTOCOL_VERSION,
  DOMAIN_DATA_PROTOCOL_VERSION,
  EXPERIENCE_PLAN_PROTOCOL_VERSION,
  INTENT_PROTOCOL_VERSION,
  PATCH_PROTOCOL_VERSION,
  PROTOCOL_KINDS,
  isSupportedProtocolVersion,
  supportedProtocolVersions,
} from "../../packages/protocol/src/index.js";

describe("protocol versioning policy", () => {
  it("registers every current protocol kind exactly once in an immutable list", () => {
    expect(PROTOCOL_KINDS).toEqual(["intent", "domain-data", "capability", "experience-plan", "patch"]);
    expect(new Set(PROTOCOL_KINDS).size).toBe(PROTOCOL_KINDS.length);
    expect(Object.isFrozen(PROTOCOL_KINDS)).toBe(true);
  });

  it("derives supported versions from the owning protocol constants", () => {
    expect(supportedProtocolVersions("intent")).toEqual([INTENT_PROTOCOL_VERSION]);
    expect(supportedProtocolVersions("domain-data")).toEqual([DOMAIN_DATA_PROTOCOL_VERSION]);
    expect(supportedProtocolVersions("capability")).toEqual([CAPABILITY_PROTOCOL_VERSION]);
    expect(supportedProtocolVersions("experience-plan")).toEqual([EXPERIENCE_PLAN_PROTOCOL_VERSION]);
    expect(supportedProtocolVersions("patch")).toEqual([PATCH_PROTOCOL_VERSION]);
  });

  it("exposes immutable version collections", () => {
    for (const kind of PROTOCOL_KINDS) {
      expect(Object.isFrozen(supportedProtocolVersions(kind))).toBe(true);
    }
  });

  it("requires exact string version matches without coercion", () => {
    expect(isSupportedProtocolVersion("intent", "1")).toBe(true);
    expect(isSupportedProtocolVersion("intent", 1)).toBe(false);
    expect(isSupportedProtocolVersion("intent", "01")).toBe(false);
    expect(isSupportedProtocolVersion("intent", "2")).toBe(false);
    expect(isSupportedProtocolVersion("patch", "1")).toBe(true);
  });
});
