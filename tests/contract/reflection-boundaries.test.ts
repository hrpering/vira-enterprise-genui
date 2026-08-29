import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { resolveState } from "../../packages/planner/src/index.js";
import { parseIntent, parseJsonValue } from "../../packages/protocol/src/index.js";
import {
  createCapabilityAllowlistPolicy,
  createComponentAllowlistPolicy,
  createNetworkPolicy,
} from "../../packages/security/src/index.js";
import {
  createTelemetryEvent,
  createTelemetryExporterPort,
} from "../../packages/telemetry/src/index.js";
import { normalizeLangChainToolMessage } from "../../packages/tool-bridge/src/index.js";
import { createWebSdkConfiguration } from "../../packages/runtime-web/src/index.js";
import { defineViraExperienceElement } from "../../packages/web-component/src/index.js";

function hostileProxy(secret: string): object {
  return new Proxy({}, {
    getPrototypeOf() {
      throw new Error(secret);
    },
  });
}

function revokedProxy(): object {
  const pair = Proxy.revocable({}, {});
  pair.revoke();
  return pair.proxy;
}

describe("public hostile reflection boundaries", () => {
  it("contains Protocol JSON and object reflection traps", () => {
    const secret = "SECRET_PROTOCOL_PROXY";
    const jsonResult = parseJsonValue(hostileProxy(secret));
    expect(jsonResult).toMatchObject({ ok: false, issue: { path: "$" } });
    if (!jsonResult.ok) expect(jsonResult.issue.reason).not.toContain(secret);

    const intentResult = parseIntent(revokedProxy());
    expect(intentResult).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$" } });
  });

  it("contains Planner and Composer root reflection traps", () => {
    const plannerSecret = "SECRET_PLANNER_PROXY";
    const plannerResult = resolveState(hostileProxy(plannerSecret));
    expect(plannerResult).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$" } });
    if (!plannerResult.ok) expect(plannerResult.issue.message).not.toContain(plannerSecret);

    const composerSecret = "SECRET_COMPOSER_PROXY";
    const composerResult = composeExperience(hostileProxy(composerSecret));
    expect(composerResult).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$" } });
    if (!composerResult.ok) expect(composerResult.issue.message).not.toContain(composerSecret);
  });

  it("contains Security and Runtime Web revoked proxy inputs", () => {
    expect(createCapabilityAllowlistPolicy(revokedProxy())).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });
    expect(createComponentAllowlistPolicy(revokedProxy())).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });
    expect(createNetworkPolicy(revokedProxy())).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });
    expect(createWebSdkConfiguration(revokedProxy())).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });
  });

  it("contains Tool Bridge descriptor reflection traps", () => {
    const secret = "SECRET_LANGCHAIN_PROXY";
    const result = normalizeLangChainToolMessage("travel.flight.search", new Proxy({}, {
      getOwnPropertyDescriptor() {
        throw new Error(secret);
      },
    }));
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_MESSAGE", path: "$.message" },
    });
    if (!result.ok) expect(result.issue.message).not.toContain(secret);
  });

  it("contains Telemetry event and exporter reflection traps", () => {
    const eventSecret = "SECRET_EVENT_PROXY";
    const eventResult = createTelemetryEvent(hostileProxy(eventSecret));
    expect(eventResult).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT", path: "$" } });
    if (!eventResult.ok) expect(eventResult.issue.message).not.toContain(eventSecret);

    const exporterSecret = "SECRET_EXPORTER_PROXY";
    const exporterResult = createTelemetryExporterPort(new Proxy({}, {
      getOwnPropertyDescriptor() {
        throw new Error(exporterSecret);
      },
    }));
    expect(exporterResult).toMatchObject({ ok: false, issue: { code: "INVALID_EXPORT_METHOD", path: "$.exportBatch" } });
    if (!exporterResult.ok) expect(exporterResult.issue.message).not.toContain(exporterSecret);
  });

  it("contains Web Component platform reflection failures", () => {
    const secret = "SECRET_PLATFORM_PROXY";
    const platform = new Proxy({}, {
      get() {
        throw new Error(secret);
      },
    });
    const result = defineViraExperienceElement(platform as never);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "REGISTRATION_FAILED", path: "$.tagName" },
    });
    if (!result.ok) expect(result.issue.message).not.toContain(secret);
  });
});
