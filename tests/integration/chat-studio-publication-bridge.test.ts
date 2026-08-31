import { describe, expect, it } from "vitest";
import {
  VIRA_FLIGHT_STUDIO_PUBLICATION,
  isViraFlightExperienceResult,
} from "../../examples/pegasus-chat-demo/lib/vira-chat-contract.js";
import { resolveChatStudioPublication } from "../../examples/pegasus-chat-demo/lib/studio-publication-resolver.js";

function result() {
  return {
    version: "1" as const,
    kind: "vira.experience" as const,
    experience: "travel.flight.search" as const,
    input: {
      origin: "SAW",
      destination: "BER",
      departureDate: "2026-09-03",
      passengers: 2,
    },
    data: {
      offers: [
        {
          id: "offer-1",
          carrier: "Vira Air",
          flightNumber: "VX 979",
          origin: "SAW",
          destination: "BER",
          departure: "09:10",
          arrival: "11:15",
          duration: "3h 05m",
          price: 138,
          currency: "EUR",
        },
      ],
    },
  };
}

describe("Chat to approved Studio publication bridge", () => {
  it("resolves a flight intent to the canonical golden StudioPublication", () => {
    const resolved = resolveChatStudioPublication(result());
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.publicationId).toBe(VIRA_FLIGHT_STUDIO_PUBLICATION);
    expect(resolved.value.publication.id).toBe(VIRA_FLIGHT_STUDIO_PUBLICATION);
    expect(resolved.value.publication.document.views).toHaveLength(9);
    expect(resolved.value.runtimeData["results.offers"]).toBeDefined();
  });

  it("rejects an arbitrary publication identity at the chat contract boundary", () => {
    expect(isViraFlightExperienceResult({ ...result(), publication: "attacker.arbitrary.ui" })).toBe(false);
  });
});
