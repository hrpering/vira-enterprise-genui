import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FLIGHT_BOOKING_ENTRYPOINT,
  FLIGHT_BOOKING_PACK_ID,
  FLIGHT_BOOKING_PACK_VERSION,
} from "../../examples/airline-brand-kit/src/chat-publication.js";
import { createDemoChatBridge } from "../../examples/pegasus-chat-demo/lib/demo-genui.js";
import { searchFlights } from "../../examples/mock-airline-domain/src/index.js";
import {
  RECIPE_CARD_ARTIFACT_DIGEST,
  RECIPE_CARD_ARTIFACT_SIZE,
  RECIPE_CARD_ENTRYPOINT,
  RECIPE_CARD_PACK_ID,
  RECIPE_CARD_PACK_VERSION,
  RECIPE_CARD_PUBLICATION,
  createRecipePayload,
} from "../../examples/recipe-brand-kit/src/index.js";
import type { ViraResolvedExperience } from "../../packages/genui-resolver/src/index.js";

function flightPresent(instanceId: string) {
  const searched = searchFlights({
    origin: "SAW",
    destination: "BER",
    departureDate: "2026-09-03",
    passengers: 2,
  });
  return {
    version: "1" as const,
    op: "present" as const,
    instanceId,
    pack: {
      id: FLIGHT_BOOKING_PACK_ID,
      version: FLIGHT_BOOKING_PACK_VERSION,
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

function recipePresent(instanceId: string) {
  return {
    version: "1" as const,
    op: "present" as const,
    instanceId,
    pack: {
      id: RECIPE_CARD_PACK_ID,
      version: RECIPE_CARD_PACK_VERSION,
      entrypoint: RECIPE_CARD_ENTRYPOINT,
    },
    payload: createRecipePayload({ dish: "shakshuka", servings: 4 }),
  };
}

function command(instanceId: string, name: string, args: Readonly<Record<string, string>> = {}) {
  return {
    version: "1" as const,
    op: "command" as const,
    instanceId,
    command: name,
    args,
  };
}

function nodeProps(experience: ViraResolvedExperience, sourceNodeId: string) {
  const view = experience.runtime.controller.currentView();
  expect(view.ok).toBe(true);
  if (!view.ok) throw new Error(view.issue.message);
  const node = view.value.nodes.find((candidate) => candidate.sourceNodeId === sourceNodeId);
  if (!node) throw new Error(`missing runtime node: ${sourceNodeId}`);
  return node.props;
}

describe("generic bridge non-Flight proof", () => {
  it("keeps the Recipe Pack artifact descriptor content-addressed", () => {
    const serialized = JSON.stringify(RECIPE_CARD_PUBLICATION);
    expect(serialized.length).toBe(RECIPE_CARD_ARTIFACT_SIZE);
    expect(`sha256:${createHash("sha256").update(serialized).digest("hex")}`).toBe(RECIPE_CARD_ARTIFACT_DIGEST);
  });

  it("mounts Flight and Recipe together without cross-instance mutation", async () => {
    const bridge = createDemoChatBridge();
    const flight = await bridge.present(flightPresent("flight-proof"));
    const recipe = await bridge.present(recipePresent("recipe-proof"));
    expect(flight.ok).toBe(true);
    expect(recipe.ok).toBe(true);
    if (!flight.ok || !recipe.ok) return;

    expect(bridge.get("flight-proof")).toBe(flight.value);
    expect(bridge.get("recipe-proof")).toBe(recipe.value);
    expect(flight.value.runtime.controller.currentViewId()).toBe("flight-search");
    expect(recipe.value.runtime.controller.currentViewId()).toBe("main");
    expect(nodeProps(recipe.value, "servings").value).toBe(4);
    expect(nodeProps(recipe.value, "favorite").active).toBe(false);

    const recipeIncrease = await bridge.command(command("recipe-proof", "increase-servings"));
    expect(recipeIncrease).toEqual({ ok: true });
    expect(nodeProps(recipe.value, "servings").value).toBe(5);
    expect(flight.value.runtime.controller.currentViewId()).toBe("flight-search");

    const searched = await flight.value.runtime.controller.dispatch({
      nodeId: "flight-search-root",
      event: "submit",
      payload: {
        origin: "SAW",
        destination: "BER",
        departureDate: "2026-09-04",
        passengers: 2,
      },
    });
    expect(searched.ok).toBe(true);
    expect(flight.value.runtime.controller.currentViewId()).toBe("flight-results");
    expect(nodeProps(recipe.value, "servings").value).toBe(5);
    expect(nodeProps(recipe.value, "favorite").active).toBe(false);

    const cheapest = await bridge.command(command("flight-proof", "select-cheapest"));
    expect(cheapest).toEqual({ ok: true });
    expect(flight.value.runtime.controller.currentViewId()).toBe("fare-comparison");
    expect(nodeProps(recipe.value, "servings").value).toBe(5);

    const favorite = await bridge.command(command("recipe-proof", "toggle-favorite"));
    expect(favorite).toEqual({ ok: true });
    expect(nodeProps(recipe.value, "favorite").active).toBe(true);
    expect(flight.value.runtime.controller.currentViewId()).toBe("fare-comparison");

    const wrongRecipeCommand = await bridge.command(command("recipe-proof", "select-cheapest"));
    expect(wrongRecipeCommand).toMatchObject({ ok: false, issue: { code: "COMMAND_FAILED" } });
    const wrongFlightCommand = await bridge.command(command("flight-proof", "increase-servings"));
    expect(wrongFlightCommand).toMatchObject({ ok: false, issue: { code: "COMMAND_FAILED" } });
    const missing = await bridge.command(command("missing-instance", "toggle-favorite"));
    expect(missing).toMatchObject({ ok: false, issue: { code: "INSTANCE_NOT_FOUND" } });

    expect(nodeProps(recipe.value, "servings").value).toBe(5);
    expect(nodeProps(recipe.value, "favorite").active).toBe(true);
    expect(flight.value.runtime.controller.currentViewId()).toBe("fare-comparison");
    bridge.dispose();
  });

  it("keeps generic Chat consumer files free of domain branching and legacy Flight tools", () => {
    const files = [
      "examples/pegasus-chat-demo/app/api/chat/route.ts",
      "examples/pegasus-chat-demo/components/vira-chat-toolkit.tsx",
    ];
    const banned = /\b(?:Flight|Recipe|Airline|Fare|Seat|Baggage|Insurance)\b|travel\.flight|vira_present_experience|vira_interact/;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(banned);
    }
  });
});
