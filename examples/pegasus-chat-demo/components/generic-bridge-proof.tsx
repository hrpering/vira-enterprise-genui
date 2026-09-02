"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ViraChatExperience } from "@vira-enterprise-genui/genui-chat";
import {
  FLIGHT_BOOKING_ENTRYPOINT,
  FLIGHT_BOOKING_PACK_ID,
  FLIGHT_BOOKING_PACK_VERSION,
} from "@vira-enterprise-genui/airline-brand-kit/chat-publication";
import { searchFlights } from "@vira-enterprise-genui/mock-airline-domain";
import {
  RECIPE_CARD_ENTRYPOINT,
  RECIPE_CARD_PACK_ID,
  RECIPE_CARD_PACK_VERSION,
  createRecipePayload,
} from "@vira-enterprise-genui/recipe-brand-kit";
import { createDemoChatBridge } from "../lib/demo-genui.js";

const FLIGHT_INSTANCE_ID = "proof-flight";
const RECIPE_INSTANCE_ID = "proof-recipe";
const proofBridge = createDemoChatBridge();

function initialFlightMessage() {
  const searched = searchFlights({
    origin: "SAW",
    destination: "BER",
    departureDate: "2026-09-03",
    passengers: 2,
  });
  return Object.freeze({
    version: "1" as const,
    op: "present" as const,
    instanceId: FLIGHT_INSTANCE_ID,
    pack: Object.freeze({
      id: FLIGHT_BOOKING_PACK_ID,
      version: FLIGHT_BOOKING_PACK_VERSION,
      entrypoint: FLIGHT_BOOKING_ENTRYPOINT,
    }),
    payload: Object.freeze({
      input: Object.freeze({
        origin: searched.origin,
        destination: searched.destination,
        departureDate: searched.departureDate,
        passengers: searched.passengers,
      }),
      data: Object.freeze({ offers: searched.offers }),
    }),
  });
}

const recipeMessage = Object.freeze({
  version: "1" as const,
  op: "present" as const,
  instanceId: RECIPE_INSTANCE_ID,
  pack: Object.freeze({
    id: RECIPE_CARD_PACK_ID,
    version: RECIPE_CARD_PACK_VERSION,
    entrypoint: RECIPE_CARD_ENTRYPOINT,
  }),
  payload: createRecipePayload({ dish: "shakshuka", servings: 4 }),
});

export function GenericBridgeProof() {
  const flightMessage = useMemo(initialFlightMessage, []);
  const [flightView, setFlightView] = useState("mounting");
  const [error, setError] = useState("");

  const refreshFlightView = useCallback(() => {
    setFlightView(proofBridge.get(FLIGHT_INSTANCE_ID)?.runtime.controller.currentViewId() ?? "mounting");
  }, []);

  useEffect(() => {
    const unsubscribe = proofBridge.subscribe(refreshFlightView);
    refreshFlightView();
    return unsubscribe;
  }, [refreshFlightView]);

  const recipeCommand = async (command: "increase-servings" | "toggle-favorite") => {
    const result = await proofBridge.command({
      version: "1",
      op: "command",
      instanceId: RECIPE_INSTANCE_ID,
      command,
      args: {},
    });
    if (!result.ok) setError(result.issue.message);
  };

  const advanceFlight = async () => {
    const experience = proofBridge.get(FLIGHT_INSTANCE_ID);
    if (!experience) {
      setError("Flight proof instance is not mounted");
      return;
    }
    const result = await experience.runtime.controller.dispatch({
      nodeId: "flight-search-root",
      event: "submit",
      payload: {
        origin: "SAW",
        destination: "BER",
        departureDate: "2026-09-04",
        passengers: 2,
      },
    });
    if (!result.ok) setError(result.issue.message);
    refreshFlightView();
  };

  const selectCheapest = async () => {
    const result = await proofBridge.command({
      version: "1",
      op: "command",
      instanceId: FLIGHT_INSTANCE_ID,
      command: "select-cheapest",
      args: {},
    });
    if (!result.ok) setError(result.issue.message);
    refreshFlightView();
  };

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: 32, display: "grid", gap: 24 }}>
      <header>
        <h1 style={{ marginBottom: 8 }}>Generic Bridge Proof</h1>
        <p style={{ margin: 0, color: "#64748b" }}>Two independent Experience Packs, one registry, one resolver, one Chat bridge.</p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
        <article data-testid="flight-experience" style={{ minWidth: 0 }}>
          <h2>Experience A</h2>
          <ViraChatExperience bridge={proofBridge} message={flightMessage} pending={<p>Mounting A…</p>} />
        </article>
        <article data-testid="recipe-experience" style={{ minWidth: 0 }}>
          <h2>Experience B</h2>
          <ViraChatExperience bridge={proofBridge} message={recipeMessage} pending={<p>Mounting B…</p>} />
        </article>
      </section>

      <section style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button type="button" data-testid="recipe-increase" onClick={() => { void recipeCommand("increase-servings"); }}>Increase B</button>
        <button type="button" data-testid="recipe-favorite" onClick={() => { void recipeCommand("toggle-favorite"); }}>Toggle B saved</button>
        <button type="button" data-testid="flight-advance" onClick={() => { void advanceFlight(); }}>Advance A</button>
        <button type="button" data-testid="flight-cheapest" onClick={() => { void selectCheapest(); }}>Command A</button>
      </section>

      <section aria-label="Proof state" style={{ fontFamily: "ui-monospace, monospace" }}>
        <span>view A: <strong data-testid="flight-view">{flightView}</strong></span>
      </section>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
