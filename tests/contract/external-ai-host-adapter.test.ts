import { describe, expect, it } from "vitest";
import {
  planViraExternalAiHostAdapter,
  type ViraApplicationAiHostCompatibilityPlanV2,
} from "../../packages/application-ai-host-sdk/src/index.js";

const projection = Object.freeze({ id: "protocol.ag-ui", versionRef: "1.0.0" });
const alternate = Object.freeze({ id: "protocol.mcp", versionRef: "2026.09" });
const compatibility = Object.freeze({
  sdkVersion: "2",
  source: {},
  host: Object.freeze({
    viraVersion: "2.1.0",
    capabilities: Object.freeze(["render", "input", "artifact", "approval"]),
    protocolProjections: Object.freeze([projection, alternate]),
  }),
  compatibleProtocolProjections: Object.freeze([projection, alternate]),
}) as unknown as ViraApplicationAiHostCompatibilityPlanV2;

function profile(hostFamily: "chatgpt" | "copilot" | "claude" | "customer-agent" = "customer-agent") {
  return {
    version: "1",
    adapterId: `adapter.${hostFamily}`,
    hostFamily,
    viraVersion: "2.1.0",
    features: ["render", "input", "artifact"] as const,
    requiredHostCapabilities: ["render", "input", "artifact"],
    protocolProjection: projection,
  } as const;
}

describe("PROD-18 external AI-host adapter compatibility contract", () => {
  it("plans ChatGPT, Copilot, Claude and customer-agent adapter paths from one host-neutral contract", () => {
    for (const hostFamily of ["chatgpt", "copilot", "claude", "customer-agent"] as const) {
      const result = planViraExternalAiHostAdapter({ compatibility, profile: profile(hostFamily) });
      expect(result).toMatchObject({
        ok: true,
        value: {
          hostFamily,
          viraVersion: "2.1.0",
          protocolProjection: projection,
          features: ["render", "input", "artifact"],
        },
      });
      if (result.ok) {
        expect(Object.isFrozen(result.value)).toBe(true);
        expect("token" in result.value).toBe(false);
        expect("endpoint" in result.value).toBe(false);
        expect("execute" in result.value).toBe(false);
      }
    }
  });

  it("rejects floating protocol projections through the canonical exact-reference parser", () => {
    expect(planViraExternalAiHostAdapter({
      compatibility,
      profile: { ...profile(), protocolProjection: { id: "protocol.ag-ui", versionRef: "latest" } },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_PROFILE", path: "$.profile.protocolProjection" } });
  });

  it("rejects adapter profiles requiring capabilities the evaluated host does not have", () => {
    expect(planViraExternalAiHostAdapter({
      compatibility,
      profile: { ...profile(), requiredHostCapabilities: ["render", "resume"] },
    })).toMatchObject({ ok: false, issue: { code: "MISSING_HOST_CAPABILITY" } });
  });

  it("rejects a protocol projection that was not proven compatible", () => {
    expect(planViraExternalAiHostAdapter({
      compatibility,
      profile: { ...profile(), protocolProjection: { id: "protocol.a2ui", versionRef: "1.0.0" } },
    })).toMatchObject({ ok: false, issue: { code: "PROJECTION_NOT_COMPATIBLE" } });
  });

  it("rejects Vira-version drift between the adapter profile and evaluated host", () => {
    expect(planViraExternalAiHostAdapter({
      compatibility,
      profile: { ...profile(), viraVersion: "2.2.0" },
    })).toMatchObject({ ok: false, issue: { code: "HOST_VERSION_MISMATCH" } });
  });

  it("rejects secret/endpoint/execution fields rather than smuggling transport authority into compatibility", () => {
    for (const extra of [
      { token: "never" },
      { endpoint: "https://example.invalid" },
      { execute: true },
    ]) {
      expect(planViraExternalAiHostAdapter({ compatibility, profile: { ...profile(), ...extra } }))
        .toMatchObject({ ok: false, issue: { code: "INVALID_PROFILE" } });
    }
  });
});
