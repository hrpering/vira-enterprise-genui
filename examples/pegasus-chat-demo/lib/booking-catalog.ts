export interface FareOption {
  readonly id: "light" | "smart" | "flex";
  readonly name: string;
  readonly perPassengerExtra: number;
  readonly badge?: string;
  readonly includes: readonly string[];
  readonly changePolicy: string;
}

export interface SeatOption {
  readonly id: string;
  readonly row: number;
  readonly letter: "A" | "B" | "C" | "D" | "E" | "F";
  readonly zone: "front" | "extra-legroom" | "standard";
  readonly fee: number;
  readonly occupied?: boolean;
}

export interface BaggageOption {
  readonly id: "none" | "15kg" | "20kg" | "25kg";
  readonly label: string;
  readonly kilograms: number;
  readonly feePerPassenger: number;
}

export interface InsuranceOption {
  readonly id: "none" | "travel" | "flex-plus";
  readonly name: string;
  readonly feePerPassenger: number;
  readonly copy: string;
}

export interface ExtraOption {
  readonly id: "priority" | "fast-track" | "meal" | "sms";
  readonly name: string;
  readonly feePerPassenger: number;
  readonly copy: string;
}

function freezeFare(option: FareOption): Readonly<FareOption> {
  return Object.freeze(option);
}

function freezeBaggage(option: BaggageOption): Readonly<BaggageOption> {
  return Object.freeze(option);
}

function freezeInsurance(option: InsuranceOption): Readonly<InsuranceOption> {
  return Object.freeze(option);
}

function freezeExtra(option: ExtraOption): Readonly<ExtraOption> {
  return Object.freeze(option);
}

export const FARE_OPTIONS: readonly FareOption[] = Object.freeze([
  freezeFare({
    id: "light",
    name: "Light",
    perPassengerExtra: 0,
    includes: Object.freeze(["Personal item", "Online check-in"]),
    changePolicy: "Changes available for a fee",
  }),
  freezeFare({
    id: "smart",
    name: "Smart",
    perPassengerExtra: 35,
    badge: "Best value",
    includes: Object.freeze(["Personal item", "Cabin bag", "20kg checked bag", "Standard seat"]),
    changePolicy: "Lower change fee",
  }),
  freezeFare({
    id: "flex",
    name: "Flex",
    perPassengerExtra: 70,
    badge: "Most flexible",
    includes: Object.freeze(["Personal item", "Cabin bag", "20kg checked bag", "Standard seat", "Priority boarding"]),
    changePolicy: "Flexible changes before departure",
  }),
]);

export const BAGGAGE_OPTIONS: readonly BaggageOption[] = Object.freeze([
  freezeBaggage({ id: "none", label: "No checked bag", kilograms: 0, feePerPassenger: 0 }),
  freezeBaggage({ id: "15kg", label: "15 kg", kilograms: 15, feePerPassenger: 18 }),
  freezeBaggage({ id: "20kg", label: "20 kg", kilograms: 20, feePerPassenger: 25 }),
  freezeBaggage({ id: "25kg", label: "25 kg", kilograms: 25, feePerPassenger: 34 }),
]);

export const INSURANCE_OPTIONS: readonly InsuranceOption[] = Object.freeze([
  freezeInsurance({ id: "none", name: "No insurance", feePerPassenger: 0, copy: "Continue without travel cover" }),
  freezeInsurance({ id: "travel", name: "Travel Protect", feePerPassenger: 12, copy: "Trip interruption and travel assistance" }),
  freezeInsurance({ id: "flex-plus", name: "Flex Protect", feePerPassenger: 22, copy: "Broader cancellation flexibility and assistance" }),
]);

export const EXTRA_OPTIONS: readonly ExtraOption[] = Object.freeze([
  freezeExtra({ id: "priority", name: "Priority boarding", feePerPassenger: 9, copy: "Board earlier and settle in sooner" }),
  freezeExtra({ id: "fast-track", name: "Fast track", feePerPassenger: 13, copy: "Priority security lane where available" }),
  freezeExtra({ id: "meal", name: "Meal", feePerPassenger: 11, copy: "Pre-order a meal for the flight" }),
  freezeExtra({ id: "sms", name: "SMS updates", feePerPassenger: 3, copy: "Flight status notifications by SMS" }),
]);

const occupied = new Set(["4B", "5E", "8A", "9D", "11C", "12F"]);
const seatRows = [4, 5, 6, 8, 9, 10, 11, 12] as const;
const letters = ["A", "B", "C", "D", "E", "F"] as const;

export const SEAT_OPTIONS: readonly SeatOption[] = Object.freeze(
  seatRows.flatMap((row): readonly SeatOption[] => letters.map((letter): SeatOption => {
    const id = `${row}${letter}`;
    const zone: SeatOption["zone"] = row <= 5 ? "front" : row === 6 ? "extra-legroom" : "standard";
    const fee = zone === "front" ? 18 : zone === "extra-legroom" ? 24 : 7;
    return Object.freeze({
      id,
      row,
      letter,
      zone,
      fee,
      ...(occupied.has(id) ? { occupied: true } : {}),
    });
  })),
);

export function fareById(value: unknown): FareOption | undefined {
  return typeof value === "string" ? FARE_OPTIONS.find((option) => option.id === value) : undefined;
}

export function baggageById(value: unknown): BaggageOption | undefined {
  return typeof value === "string" ? BAGGAGE_OPTIONS.find((option) => option.id === value) : undefined;
}

export function insuranceById(value: unknown): InsuranceOption | undefined {
  return typeof value === "string" ? INSURANCE_OPTIONS.find((option) => option.id === value) : undefined;
}

export function extraById(value: unknown): ExtraOption | undefined {
  return typeof value === "string" ? EXTRA_OPTIONS.find((option) => option.id === value) : undefined;
}

export function seatById(value: unknown): SeatOption | undefined {
  return typeof value === "string" ? SEAT_OPTIONS.find((option) => option.id === value) : undefined;
}

export function baggageFeeForFare(option: BaggageOption, fareId: string | undefined): number {
  if ((fareId === "smart" || fareId === "flex") && option.kilograms <= 20) return 0;
  if ((fareId === "smart" || fareId === "flex") && option.id === "25kg") return 9;
  return option.feePerPassenger;
}

export function seatFeeForFare(option: SeatOption, fareId: string | undefined): number {
  if ((fareId === "smart" || fareId === "flex") && option.zone === "standard") return 0;
  return option.fee;
}

export function extraFeeForFare(option: ExtraOption, fareId: string | undefined): number {
  if (fareId === "flex" && option.id === "priority") return 0;
  return option.feePerPassenger;
}
