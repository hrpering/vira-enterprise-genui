import { describe, expect, it } from "vitest";
import { isViraFlightExperienceResult } from "../../examples/pegasus-chat-demo/lib/vira-chat-contract.js";

function validResult() {
  return {
    version: "1",
    kind: "vira.experience",
    experience: "travel.flight.search",
    input: {
      origin: "SAW",
      destination: "BER",
      departureDate: "2026-09-03",
      passengers: 2,
    },
    data: {
      offers: [{
        id: "offer-vx979",
        carrier: "Vira Demo Air",
        flightNumber: "VX 979",
        origin: "SAW",
        destination: "BER",
        departure: "09:10",
        arrival: "11:15",
        duration: "2h 05m",
        price: 138,
        currency: "EUR",
      }],
    },
  };
}

describe("Pegasus Chat approved GenUI result contract", () => {
  it("accepts only the approved flight-experience discriminator with a valid offer payload", () => {
    expect(isViraFlightExperienceResult(validResult())).toBe(true);
  });

  it("rejects a different experience before the Chat renderer can construct a Studio publication", () => {
    expect(isViraFlightExperienceResult({
      ...validResult(),
      experience: "travel.hotel.search",
    })).toBe(false);
  });

  it("rejects malformed passenger and offer data fail closed", () => {
    expect(isViraFlightExperienceResult({
      ...validResult(),
      input: { ...validResult().input, passengers: 1.5 },
    })).toBe(false);
    expect(isViraFlightExperienceResult({
      ...validResult(),
      data: {
        offers: [{ ...validResult().data.offers[0], price: Number.NaN }],
      },
    })).toBe(false);
    expect(isViraFlightExperienceResult({
      ...validResult(),
      data: { offers: "not-an-array" },
    })).toBe(false);
  });
});
