import { describe, expect, it } from "vitest";
import {
  FLIGHT_BOOKING_COMPONENT_CATALOG,
  FLIGHT_BOOKING_ENTRYPOINT,
  FLIGHT_BOOKING_PACK_ID,
  FLIGHT_BOOKING_PACK_VERSION,
} from "../../examples/airline-brand-kit/src/chat-publication.js";
import { CANONICAL_CHAT_RENDERERS } from "../../examples/pegasus-chat-demo/components/canonical-chat-renderers.js";
import { createDemoChatBridge } from "../../examples/pegasus-chat-demo/lib/demo-genui.js";

describe("Pegasus Chat Flight Experience Pack contract", () => {
  it("keeps the trusted renderer registry in exact parity with the Flight Pack catalog", () => {
    const componentRefs = FLIGHT_BOOKING_COMPONENT_CATALOG.components
      .map((component) => component.ref)
      .sort();
    expect(Object.keys(CANONICAL_CHAT_RENDERERS).sort()).toEqual(componentRefs);
  });

  it("fails closed when the registered Flight Pack receives malformed domain payload", async () => {
    const bridge = createDemoChatBridge();
    const result = await bridge.present({
      version: "1",
      op: "present",
      instanceId: "flight-malformed",
      pack: {
        id: FLIGHT_BOOKING_PACK_ID,
        version: FLIGHT_BOOKING_PACK_VERSION,
        entrypoint: FLIGHT_BOOKING_ENTRYPOINT,
      },
      payload: {
        input: {
          origin: "SAW",
          destination: "BER",
          departureDate: "2026-09-03",
          passengers: 1.5,
        },
        data: { offers: [] },
      },
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "RESOLUTION_FAILED" } });
    bridge.dispose();
  });

  it("fails closed when an unregistered Pack identity is requested", async () => {
    const bridge = createDemoChatBridge();
    const result = await bridge.present({
      version: "1",
      op: "present",
      instanceId: "not-flight",
      pack: {
        id: "vira/not-registered",
        version: "1.0.0",
        entrypoint: "main",
      },
      payload: {},
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "RESOLUTION_FAILED" } });
    bridge.dispose();
  });
});
