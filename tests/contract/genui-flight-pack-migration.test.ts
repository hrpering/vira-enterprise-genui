import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  FLIGHT_BOOKING_ARTIFACT_DIGEST,
  FLIGHT_BOOKING_ARTIFACT_SIZE,
  FLIGHT_BOOKING_ENTRYPOINT,
  FLIGHT_BOOKING_PACK_MANIFEST,
  FLIGHT_BOOKING_PUBLICATION,
} from "../../examples/airline-brand-kit/src/chat-publication.js";
import { createFlightChatBridge } from "../../examples/pegasus-chat-demo/lib/flight-genui.js";
import { searchFlights } from "../../examples/mock-airline-domain/src/index.js";

function presentMessage(instanceId: string, destination: string) {
  const searched = searchFlights({
    origin: "SAW",
    destination,
    departureDate: "2026-09-03",
    passengers: 2,
  });
  return {
    version: "1" as const,
    op: "present" as const,
    instanceId,
    pack: {
      id: FLIGHT_BOOKING_PACK_MANIFEST.id,
      version: FLIGHT_BOOKING_PACK_MANIFEST.version,
      entrypoint: FLIGHT_BOOKING_ENTRYPOINT,
    },
    payload: {
      input: {
        origin: searched.origin,
        destination: searched.destination,
        departureDate: searched.departureDate,
        passengers: searched.passengers,
      },
      data: { offers: searched.offers },
    },
  };
}

describe("Flight Experience Pack migration", () => {
  it("pins the Pack artifact descriptor to the exact canonical publication bytes", () => {
    const serialized = JSON.stringify(FLIGHT_BOOKING_PUBLICATION);
    const digest = `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
    const artifact = FLIGHT_BOOKING_PACK_MANIFEST.artifacts.find(
      (candidate) => candidate.id === FLIGHT_BOOKING_ENTRYPOINT,
    );

    expect(serialized.length).toBe(FLIGHT_BOOKING_ARTIFACT_SIZE);
    expect(digest).toBe(FLIGHT_BOOKING_ARTIFACT_DIGEST);
    expect(artifact).toMatchObject({
      id: FLIGHT_BOOKING_ENTRYPOINT,
      role: "studio-publication",
      mediaType: "application/json",
      digest: FLIGHT_BOOKING_ARTIFACT_DIGEST,
      size: FLIGHT_BOOKING_ARTIFACT_SIZE,
    });
  });

  it("targets commands by exact instanceId instead of the latest mounted experience", async () => {
    const bridge = createFlightChatBridge();
    const first = await bridge.present(presentMessage("flight-a", "BER"));
    const second = await bridge.present(presentMessage("flight-b", "FCO"));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const firstSearch = await first.value.runtime.controller.dispatch({
      nodeId: "flight-search-root",
      event: "submit",
      payload: { origin: "SAW", destination: "BER", departureDate: "2026-09-03", passengers: 2 },
    });
    const secondSearch = await second.value.runtime.controller.dispatch({
      nodeId: "flight-search-root",
      event: "submit",
      payload: { origin: "SAW", destination: "FCO", departureDate: "2026-09-03", passengers: 2 },
    });
    expect(firstSearch.ok).toBe(true);
    expect(secondSearch.ok).toBe(true);
    expect(first.value.runtime.controller.currentViewId()).toBe("flight-results");
    expect(second.value.runtime.controller.currentViewId()).toBe("flight-results");

    const command = await bridge.command({
      version: "1",
      op: "command",
      instanceId: "flight-a",
      command: "select-cheapest",
      args: {},
    });
    expect(command).toEqual({ ok: true });
    expect(first.value.runtime.controller.currentViewId()).toBe("fare-comparison");
    expect(second.value.runtime.controller.currentViewId()).toBe("flight-results");

    const unknown = await bridge.command({
      version: "1",
      op: "command",
      instanceId: "flight-missing",
      command: "select-cheapest",
      args: {},
    });
    expect(unknown).toMatchObject({ ok: false, issue: { code: "INSTANCE_NOT_FOUND" } });
    bridge.dispose();
  });

  it("keeps Pegasus Flight Chat on the one generic vira_experience tool surface", async () => {
    const [route, toolkit, profile] = await Promise.all([
      readFile(new URL("../../examples/pegasus-chat-demo/app/api/chat/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../../examples/pegasus-chat-demo/components/vira-chat-toolkit.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../examples/pegasus-chat-demo/components/flight-runtime-profile.ts", import.meta.url), "utf8"),
    ]);

    expect(route).toContain("vira_experience");
    expect(toolkit).toContain("vira_experience");
    expect(route).not.toContain("vira_present_experience");
    expect(route).not.toContain("vira_interact");
    expect(toolkit).not.toContain("vira_present_experience");
    expect(toolkit).not.toContain("vira_interact");
    expect(profile).not.toContain("activeTarget");
    expect(profile).not.toContain("latest");
  });
});
