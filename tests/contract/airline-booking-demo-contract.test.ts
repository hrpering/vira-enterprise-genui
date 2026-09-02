import { describe, expect, it } from "vitest";
import {
  BAGGAGE_OPTIONS,
  baggageFeeForFare,
  EXTRA_OPTIONS,
  extraFeeForFare,
  FARE_OPTIONS,
  SEAT_OPTIONS,
  seatFeeForFare,
} from "../../examples/airline-brand-kit/src/index.js";
import {
  FLIGHT_BOOKING_ENTRYPOINT,
  FLIGHT_BOOKING_PACK_ID,
  FLIGHT_BOOKING_PACK_VERSION,
} from "../../examples/airline-brand-kit/src/chat-publication.js";
import { parseViraExperienceMessage } from "../../packages/genui-resolver/src/index.js";

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

  it("accepts only the generic exact-instance command envelope", () => {
    expect(parseViraExperienceMessage({
      version: "1",
      op: "command",
      instanceId: "flight-a",
      command: "set-baggage-all",
      args: { value: "20kg" },
    }).ok).toBe(true);

    expect(parseViraExperienceMessage({
      version: "1",
      op: "command",
      instanceId: "",
      command: "set-baggage-all",
      args: { value: "20kg" },
    }).ok).toBe(false);
  });

  it("accepts the Flight Pack through the generic present envelope", () => {
    const parsed = parseViraExperienceMessage({
      version: "1",
      op: "present",
      instanceId: "flight-a",
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
          passengers: 2,
        },
        data: { offers: [] },
      },
    });
    expect(parsed.ok).toBe(true);
  });
});
