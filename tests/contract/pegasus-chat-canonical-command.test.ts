import { describe, expect, it } from "vitest";
import type { ViraExperienceRuntime } from "../../packages/genui/src/index.js";
import {
  applyCanonicalViraCommand,
  registerCanonicalChatCommandTarget,
} from "../../examples/pegasus-chat-demo/components/canonical-chat-command.js";
import type { FlightOffer, ViraCommandResult } from "../../examples/pegasus-chat-demo/lib/vira-chat-contract.js";

const offers: readonly FlightOffer[] = [
  {
    id: "expensive",
    carrier: "Vira Demo Air",
    flightNumber: "VX 981",
    origin: "SAW",
    destination: "BER",
    departure: "18:20",
    arrival: "20:25",
    duration: "2h 05m",
    price: 166,
    currency: "EUR",
  },
  {
    id: "cheap",
    carrier: "Vira Demo Air",
    flightNumber: "VX 979",
    origin: "SAW",
    destination: "BER",
    departure: "09:10",
    arrival: "11:15",
    duration: "2h 05m",
    price: 138,
    currency: "EUR",
  },
];

function command(command: ViraCommandResult["command"], value?: string): ViraCommandResult {
  return {
    version: "1",
    kind: "vira.command",
    command,
    ...(value === undefined ? {} : { value }),
  };
}

function target(initialView: string) {
  let view = initialView;
  const dispatches: Array<{ nodeId: string; event: string; payload?: unknown }> = [];
  const runtime = {
    controller: {
      currentViewId: () => view,
      dispatch: async (input: { nodeId: string; event: string; payload?: unknown }) => {
        dispatches.push(input);
        return {
          ok: true,
          value: {
            actionId: `test-${dispatches.length}`,
            actionType: "travel.flight.test",
            outcome: "success",
            completion: { viewId: view, transitioned: false },
          },
        };
      },
    },
  } as unknown as ViraExperienceRuntime;
  return {
    runtime,
    dispatches,
    setView(next: string) { view = next; },
  };
}

describe("Pegasus Chat canonical command bridge", () => {
  it("fails closed when no canonical booking experience is mounted", async () => {
    await expect(applyCanonicalViraCommand(command("select-cheapest"))).resolves.toEqual({
      ok: false,
      reason: "NO_ACTIVE_EXPERIENCE",
    });
  });

  it("maps step-changing commands to the existing canonical Studio events", async () => {
    const fixture = target("flight-results");
    const unregister = registerCanonicalChatCommandTarget({ runtime: fixture.runtime, offers: () => offers });
    try {
      await expect(applyCanonicalViraCommand(command("select-cheapest"))).resolves.toEqual({ ok: true });
      expect(fixture.dispatches.at(-1)).toEqual({
        nodeId: "flight-results-root",
        event: "select",
        payload: { offerId: "cheap" },
      });

      fixture.setView("fare-comparison");
      await expect(applyCanonicalViraCommand(command("select-fare", "flex"))).resolves.toEqual({ ok: true });
      expect(fixture.dispatches.at(-1)).toEqual({
        nodeId: "fare-comparison-root",
        event: "select",
        payload: { fareId: "flex" },
      });

      fixture.setView("seat-selection");
      await expect(applyCanonicalViraCommand(command("set-seat-zone", "front"))).resolves.toEqual({ ok: true });
      expect(fixture.dispatches.at(-1)).toMatchObject({
        nodeId: "seat-selection-root",
        event: "select",
        payload: { passengerIndex: 0 },
      });
      expect(typeof (fixture.dispatches.at(-1)?.payload as { seat?: unknown } | undefined)?.seat).toBe("string");

      fixture.setView("baggage");
      await expect(applyCanonicalViraCommand(command("set-baggage-all", "20kg"))).resolves.toEqual({ ok: true });
      expect(fixture.dispatches.at(-1)).toEqual({
        nodeId: "baggage-root",
        event: "select",
        payload: { applyToAll: true, optionId: "20kg" },
      });
    } finally {
      unregister();
    }
  });

  it("keeps partial extras commands on the canonical assistant-command interaction", async () => {
    const fixture = target("extras");
    const unregister = registerCanonicalChatCommandTarget({ runtime: fixture.runtime, offers: () => offers });
    try {
      await expect(applyCanonicalViraCommand(command("set-insurance", "flex-plus"))).resolves.toEqual({ ok: true });
      expect(fixture.dispatches.at(-1)).toEqual({
        nodeId: "extras-root",
        event: "assistant-command",
        payload: { command: "set-insurance", value: "flex-plus" },
      });

      fixture.setView("booking-review");
      await expect(applyCanonicalViraCommand(command("add-extra", "meal"))).resolves.toEqual({ ok: true });
      expect(fixture.dispatches.at(-1)).toEqual({
        nodeId: "booking-review-root",
        event: "assistant-command",
        payload: { command: "add-extra", value: "meal" },
      });
    } finally {
      unregister();
    }
  });

  it("rejects wrong-step and invalid command values without dispatching", async () => {
    const fixture = target("flight-results");
    const unregister = registerCanonicalChatCommandTarget({ runtime: fixture.runtime, offers: () => offers });
    try {
      await expect(applyCanonicalViraCommand(command("select-fare", "not-a-fare"))).resolves.toEqual({
        ok: false,
        reason: "WRONG_STEP",
      });
      fixture.setView("fare-comparison");
      await expect(applyCanonicalViraCommand(command("select-fare", "not-a-fare"))).resolves.toEqual({
        ok: false,
        reason: "INVALID_VALUE",
      });
      expect(fixture.dispatches).toEqual([]);
    } finally {
      unregister();
    }
  });

  it("targets the most recently mounted canonical booking and restores the previous target on cleanup", async () => {
    const first = target("flight-results");
    const second = target("flight-results");
    const unregisterFirst = registerCanonicalChatCommandTarget({ runtime: first.runtime, offers: () => offers });
    const unregisterSecond = registerCanonicalChatCommandTarget({ runtime: second.runtime, offers: () => offers });
    try {
      await applyCanonicalViraCommand(command("select-cheapest"));
      expect(first.dispatches).toEqual([]);
      expect(second.dispatches).toHaveLength(1);

      unregisterSecond();
      await applyCanonicalViraCommand(command("select-cheapest"));
      expect(first.dispatches).toHaveLength(1);
    } finally {
      unregisterSecond();
      unregisterFirst();
    }
  });
});
