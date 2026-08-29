import { describe, expect, it } from "vitest";
import {
  BAGGAGE_OPTIONS,
  baggageFeeForFare,
  EXTRA_OPTIONS,
  extraFeeForFare,
  FARE_OPTIONS,
  SEAT_OPTIONS,
  seatFeeForFare,
} from "../../examples/pegasus-chat-demo/lib/booking-catalog.js";
import {
  isViraCommandResult,
  isViraFlightExperienceResult,
} from "../../examples/pegasus-chat-demo/lib/vira-chat-contract.js";

describe("airline booking demo contracts", () => {
  it("keeps fare-aware baggage and seat pricing deterministic", () => {
    const twentyKg = BAGGAGE_OPTIONS.find((option) => option.id === "20kg");
    const frontSeat = SEAT_OPTIONS.find((option) => option.id === "4A");
    const standardSeat = SEAT_OPTIONS.find((option) => option.zone === "standard" && !option.occupied);
    expect(twentyKg).toBeDefined();
    expect(frontSeat).toBeDefined();
    expect(standardSeat).toBeDefined();
    if (!twentyKg || !frontSeat || !standardSeat) return;

    expect(baggageFeeForFare(twentyKg, "light")).toBe(25);
    expect(baggageFeeForFare(twentyKg, "smart")).toBe(0);
    expect(baggageFeeForFare(twentyKg, "flex")).toBe(0);
    expect(seatFeeForFare(standardSeat, "smart")).toBe(0);
    expect(seatFeeForFare(frontSeat, "smart")).toBe(frontSeat.fee);
  });

  it("does not charge Flex twice for included priority boarding", () => {
    const priority = EXTRA_OPTIONS.find((option) => option.id === "priority");
    expect(priority).toBeDefined();
    if (!priority) return;
    expect(extraFeeForFare(priority, "light")).toBe(priority.feePerPassenger);
    expect(extraFeeForFare(priority, "flex")).toBe(0);
  });

  it("keeps the comparison catalog complete and stable", () => {
    expect(FARE_OPTIONS.map((fare) => fare.id)).toEqual(["light", "smart", "flex"]);
    expect(BAGGAGE_OPTIONS.map((bag) => bag.id)).toEqual(["none", "15kg", "20kg", "25kg"]);
    expect(SEAT_OPTIONS.some((seat) => seat.occupied)).toBe(true);
    expect(SEAT_OPTIONS.some((seat) => seat.zone === "extra-legroom")).toBe(true);
  });

  it("accepts only explicit Vira chat command results", () => {
    expect(isViraCommandResult({
      version: "1",
      kind: "vira.command",
      command: "set-baggage-all",
      value: "20kg",
    })).toBe(true);
    expect(isViraCommandResult({
      version: "1",
      kind: "vira.command",
      command: "book-it-now",
    })).toBe(false);
  });

  it("validates the Vira flight experience result boundary", () => {
    expect(isViraFlightExperienceResult({
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
          id: "PC-981",
          carrier: "Pegasus",
          flightNumber: "PC 981",
          origin: "SAW",
          destination: "BER",
          departure: "09:20",
          arrival: "11:10",
          duration: "2h 50m",
          price: 178,
          currency: "EUR",
        }],
      },
    })).toBe(true);
  });
});
