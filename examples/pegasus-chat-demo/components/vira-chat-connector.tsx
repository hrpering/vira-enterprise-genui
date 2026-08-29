"use client";

import {
  createActionAdapterContract,
  createComponentAdapterContract,
} from "@vira-enterprise-genui/adapter-sdk";
import { composeExperience } from "@vira-enterprise-genui/composer";
import { planExperience } from "@vira-enterprise-genui/planner";
import { parseDomainData, type JsonObject } from "@vira-enterprise-genui/protocol";
import {
  ViraExperience,
  type ViraExperienceHandle,
} from "@vira-enterprise-genui/react";
import type {
  ViraGenUI,
  ViraGenUIEventMap,
} from "@vira-enterprise-genui/runtime-web";
import { defineToolkit } from "@assistant-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  baggageById,
  baggageFeeForFare,
  extraById,
  extraFeeForFare,
  fareById,
  insuranceById,
  seatById,
  seatFeeForFare,
  SEAT_OPTIONS,
} from "../lib/booking-catalog";
import { createPegasusViraDomController } from "../lib/pegasus-vira-port";
import {
  isViraCommandResult,
  isViraFlightExperienceResult,
  type FlightOffer,
  type ViraCommandResult,
  type ViraFlightExperienceResult,
} from "../lib/vira-chat-contract";

const capability = (id: string) => ({ version: "1" as const, id });

const componentAdapterResult = createComponentAdapterContract({
  version: "1",
  id: "pegasus.chat.components",
  mappings: [
    { capability: capability("search-flights"), component: "pegasus.component.flight-search" },
    { capability: capability("display.flight-results"), component: "pegasus.component.flight-results" },
    { capability: capability("flight-booking-flow"), component: "pegasus.component.booking-flow" },
  ],
});
if (!componentAdapterResult.ok) throw new Error("Invalid airline Vira component adapter");
const componentAdapter = componentAdapterResult.value;

const actionAdapterResult = createActionAdapterContract({
  version: "1",
  id: "pegasus.chat.actions",
  mappings: [
    { event: "search.submit", actionType: "travel.flight.search.submit" },
    { event: "offer.select", actionType: "travel.flight.offer.select" },
    { event: "fare.select", actionType: "travel.flight.fare.select" },
    { event: "passenger.submit", actionType: "travel.flight.passenger.submit" },
    { event: "seat.select", actionType: "travel.flight.seat.select" },
    { event: "baggage.select", actionType: "travel.flight.baggage.select" },
    { event: "extras.submit", actionType: "travel.flight.extras.submit" },
    { event: "booking.handoff", actionType: "travel.flight.booking.handoff" },
    { event: "assistant.command", actionType: "travel.flight.assistant.command" },
  ],
});
if (!actionAdapterResult.ok) throw new Error("Invalid airline Vira action adapter");
const actionAdapter = actionAdapterResult.value;

const allowedActions = [
  "travel.flight.search.submit",
  "travel.flight.offer.select",
  "travel.flight.fare.select",
  "travel.flight.passenger.submit",
  "travel.flight.seat.select",
  "travel.flight.baggage.select",
  "travel.flight.extras.submit",
  "travel.flight.booking.handoff",
  "travel.flight.assistant.command",
  "runtime.patch.apply",
] as const;

const permissionPolicy = {
  version: "1",
  rules: allowedActions.map((id) => ({ subject: "action" as const, id, effect: "allow" as const })),
} as const;

const capabilityAllowlist = {
  version: "1",
  allowed: ["search-flights", "display.flight-results", "flight-booking-flow"],
} as const;

const componentAllowlist = {
  version: "1",
  allowed: [
    "pegasus.component.flight-search",
    "pegasus.component.flight-results",
    "pegasus.component.booking-flow",
  ],
} as const;

const accessibility = {
  version: "1",
  focusOnMount: "first-primary",
  focusOnUpdate: "primary-if-lost",
  statusAnnouncements: "polite",
  errorAnnouncements: "assertive",
} as const;

const responsive = {
  version: "1",
  strategy: "container",
  bands: [
    { id: "compact", minInlineSizePx: 0 },
    { id: "regular", minInlineSizePx: 560 },
  ],
} as const;

let activeViraSdk: ViraGenUI | undefined;

function normalizeCode(value: string): string {
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : code.slice(0, 3);
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function objectArray(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const object = objectValue(entry);
    return object ? [object] : [];
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function offersFor(
  seed: ViraFlightExperienceResult,
  input: ViraFlightExperienceResult["input"],
): FlightOffer[] {
  const origin = normalizeCode(input.origin) || seed.data.offers[0]?.origin || "SAW";
  const destination = normalizeCode(input.destination) || seed.data.offers[0]?.destination || "BER";
  return seed.data.offers.map((offer) => ({
    ...offer,
    origin,
    destination,
    price: Math.max(
      1,
      Math.round((offer.price / Math.max(1, seed.input.passengers)) * input.passengers),
    ),
  }));
}

function domainDataFor(offers: readonly FlightOffer[]) {
  const parsed = parseDomainData({
    version: "1",
    domain: "travel.flight",
    type: "results",
    data: { offers },
    source: { kind: "function", name: "travel.flight.search" },
  });
  return parsed.ok ? parsed.value : undefined;
}

function buildExperience(seed: ViraFlightExperienceResult) {
  const initialData = domainDataFor(seed.data.offers);
  if (!initialData) return undefined;

  const planned = planExperience({
    id: "pegasus-chat-flight-booking",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {
      origin: seed.data.offers[0]?.origin ?? normalizeCode(seed.input.origin),
      destination: seed.data.offers[0]?.destination ?? normalizeCode(seed.input.destination),
      "departure-date": seed.input.departureDate,
      passengers: seed.input.passengers,
      "flight-results": initialData,
      "booking-step": "search",
      "seat-selections": [],
      "baggage-selections": [],
      extras: [],
      "insurance-id": "none",
    },
    requiredState: ["origin", "destination", "departure-date"],
    capabilityRequirements: [],
    availableCapabilities: [
      capability("search-flights"),
      capability("display.flight-results"),
      capability("flight-booking-flow"),
    ],
    futureCapabilities: [],
  });
  if (!planned.ok) return undefined;

  const composed = composeExperience({
    plan: planned.value,
    layout: { family: "flow" },
    disclosure: {
      primary: "immediate",
      supporting: "progressive",
      deferred: "on-demand",
    },
  });
  if (!composed.ok) return undefined;

  return {
    experienceId: "pegasus-chat-flight-booking",
    plan: planned.value,
    composition: composed.value,
  };
}

function stateOffers(state: ViraGenUIEventMap["statechange"]): JsonObject[] {
  const raw = state.plan.state["flight-results"];
  if (raw === undefined) return [];
  const parsed = parseDomainData(raw);
  if (!parsed.ok) return [];
  const data = objectValue(parsed.value.data);
  return data && Array.isArray(data.offers) ? objectArray(data.offers) : [];
}

function selectedOffer(state: ViraGenUIEventMap["statechange"]): JsonObject | undefined {
  const id = textValue(state.plan.state["selected-offer"]);
  return id ? stateOffers(state).find((offer) => offer.id === id) : undefined;
}

function passengerCount(state: ViraGenUIEventMap["statechange"], fallback: number): number {
  const count = numberValue(state.plan.state.passengers);
  return count && Number.isInteger(count) ? Math.min(8, Math.max(1, count)) : fallback;
}

function replacePassengerSelection(
  selections: readonly JsonObject[],
  passengerIndex: number,
  next: JsonObject,
): JsonObject[] {
  return [...selections.filter((entry) => entry.passengerIndex !== passengerIndex), next]
    .sort((a, b) => (numberValue(a.passengerIndex) ?? 0) - (numberValue(b.passengerIndex) ?? 0));
}

function bookingTotal(state: ViraGenUIEventMap["statechange"]): number {
  const fare = numberValue(state.plan.state["fare-total"]) ?? 0;
  const seat = objectArray(state.plan.state["seat-selections"])
    .reduce((sum, entry) => sum + (numberValue(entry.fee) ?? 0), 0);
  const baggage = objectArray(state.plan.state["baggage-selections"])
    .reduce((sum, entry) => sum + (numberValue(entry.fee) ?? 0), 0);
  const insurance = numberValue(state.plan.state["insurance-total"]) ?? 0;
  const extras = numberValue(state.plan.state["extras-total"]) ?? 0;
  return Math.round((fare + seat + baggage + insurance + extras) * 100) / 100;
}

function queuePatch(sdk: ViraGenUI, operations: readonly unknown[]): void {
  queueMicrotask(() => {
    sdk.patch({ version: "1", operations });
  });
}

function handleAssistantCommand(
  sdk: ViraGenUI,
  state: ViraGenUIEventMap["statechange"],
  command: string,
  value: string | undefined,
  fallbackPassengers: number,
): void {
  const count = passengerCount(state, fallbackPassengers);
  const currentStep = textValue(state.plan.state["booking-step"]) ?? "search";

  if (command === "select-cheapest") {
    const offers = stateOffers(state);
    const cheapest = offers
      .filter((offer) => typeof offer.id === "string" && numberValue(offer.price) !== undefined)
      .sort((a, b) => (numberValue(a.price) ?? 0) - (numberValue(b.price) ?? 0))[0];
    if (!cheapest || typeof cheapest.id !== "string") return;
    queuePatch(sdk, [
      { op: "set", path: "/state/selected-offer", value: cheapest.id },
      { op: "set", path: "/state/booking-step", value: "fare" },
    ]);
    return;
  }

  if (command === "select-fare") {
    const fare = fareById(value);
    const offer = selectedOffer(state);
    const base = offer ? numberValue(offer.price) : undefined;
    if (!fare || base === undefined) return;
    queuePatch(sdk, [
      { op: "set", path: "/state/fare-bundle", value: fare.id },
      { op: "set", path: "/state/fare-total", value: base + fare.perPassengerExtra * count },
      { op: "set", path: "/state/booking-step", value: "passengers" },
    ]);
    return;
  }

  if (command === "set-baggage-all") {
    const option = baggageById(value);
    if (!option) return;
    const fareId = textValue(state.plan.state["fare-bundle"]);
    const fee = baggageFeeForFare(option, fareId);
    const selections = Array.from({ length: count }, (_, passengerIndex) => ({
      passengerIndex,
      optionId: option.id,
      kilograms: option.kilograms,
      fee,
    }));
    queuePatch(sdk, [
      { op: "set", path: "/state/baggage-selections", value: selections },
      ...(currentStep === "baggage"
        ? [{ op: "set", path: "/state/booking-step", value: "extras" }]
        : []),
    ]);
    return;
  }

  if (command === "set-insurance") {
    const insurance = insuranceById(value);
    if (!insurance) return;
    queuePatch(sdk, [
      { op: "set", path: "/state/insurance-id", value: insurance.id },
      { op: "set", path: "/state/insurance-total", value: insurance.feePerPassenger * count },
    ]);
    return;
  }

  if (command === "add-extra") {
    const extra = extraById(value);
    if (!extra) return;
    const fareId = textValue(state.plan.state["fare-bundle"]);
    const extras = Array.from(new Set([...stringArray(state.plan.state.extras), extra.id]));
    const total = extras.reduce((sum, id) => {
      const option = extraById(id);
      return option ? sum + extraFeeForFare(option, fareId) * count : sum;
    }, 0);
    queuePatch(sdk, [
      { op: "set", path: "/state/extras", value: extras },
      { op: "set", path: "/state/extras-total", value: total },
    ]);
    return;
  }

  if (command === "set-seat-zone") {
    const zone = value === "front" || value === "extra-legroom" || value === "standard" ? value : undefined;
    if (!zone) return;
    const fareId = textValue(state.plan.state["fare-bundle"]);
    const seats = SEAT_OPTIONS.filter((seat) => seat.zone === zone && !seat.occupied).slice(0, count);
    if (seats.length < count) return;
    const selections = seats.map((seat, passengerIndex) => ({
      passengerIndex,
      seat: seat.id,
      fee: seatFeeForFare(seat, fareId),
    }));
    queuePatch(sdk, [
      { op: "set", path: "/state/seat-selections", value: selections },
      ...(currentStep === "seats"
        ? [{ op: "set", path: "/state/booking-step", value: "baggage" }]
        : []),
    ]);
  }
}

function AirlineViraExperience({ result }: { result: ViraFlightExperienceResult }) {
  const handleRef = useRef<ViraExperienceHandle | null>(null);
  const sdkIdentityRef = useRef<ViraGenUI | undefined>(undefined);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const controller = useMemo(
    () => container ? createPegasusViraDomController(container, result) : undefined,
    [container, result],
  );
  const experience = useMemo(() => buildExperience(result), [result]);
  const configuration = useMemo(() => {
    if (!controller) return undefined;
    let id = 0;
    return {
      componentAdapter,
      actionAdapter,
      permissionPolicy,
      capabilityAllowlist,
      componentAllowlist,
      accessibility,
      responsive,
      domPort: controller.port,
      idFactory: {
        nextId() {
          id += 1;
          return `airline-chat-action-${id}`;
        },
      },
    };
  }, [controller]);

  useEffect(() => () => {
    if (activeViraSdk === sdkIdentityRef.current) activeViraSdk = undefined;
  }, []);

  if (!experience) {
    return <div className="flight-error">Vira could not build this experience.</div>;
  }

  const handleEffect = (effect: ViraGenUIEventMap["effect"]) => {
    if (effect.type !== "host-action" || !controller) return;
    const sdk = handleRef.current?.getSdk();
    const state = sdk?.currentState();
    if (!sdk || !state) return;
    const count = passengerCount(state, result.input.passengers);

    if (effect.action.type === "travel.flight.search.submit") {
      const payload = effect.action.payload;
      const passengers = typeof payload.passengers === "number"
        ? Math.min(8, Math.max(1, payload.passengers))
        : result.input.passengers;
      const input: ViraFlightExperienceResult["input"] = {
        origin: typeof payload.origin === "string" ? payload.origin : result.input.origin,
        destination: typeof payload.destination === "string" ? payload.destination : result.input.destination,
        departureDate: typeof payload.departureDate === "string" ? payload.departureDate : result.input.departureDate,
        passengers,
      };
      const domainData = domainDataFor(offersFor(result, input));
      if (!domainData) return;
      queuePatch(sdk, [
        { op: "set", path: "/state/origin", value: input.origin },
        { op: "set", path: "/state/destination", value: input.destination },
        { op: "set", path: "/state/departure-date", value: input.departureDate },
        { op: "set", path: "/state/passengers", value: input.passengers },
        { op: "set", path: "/state/flight-results", value: domainData },
        { op: "set", path: "/state/selected-offer", value: null },
        { op: "set", path: "/state/booking-step", value: "search" },
        { op: "set", path: "/state/fare-bundle", value: null },
        { op: "set", path: "/state/fare-total", value: 0 },
        { op: "set", path: "/state/passenger-details", value: [] },
        { op: "set", path: "/state/contact", value: null },
        { op: "set", path: "/state/seat-selections", value: [] },
        { op: "set", path: "/state/baggage-selections", value: [] },
        { op: "set", path: "/state/insurance-id", value: "none" },
        { op: "set", path: "/state/insurance-total", value: 0 },
        { op: "set", path: "/state/extras", value: [] },
        { op: "set", path: "/state/extras-total", value: 0 },
        { op: "set", path: "/state/payment-handoff", value: null },
      ]);
      return;
    }

    if (effect.action.type === "travel.flight.offer.select") {
      const offerId = effect.action.payload.offerId;
      if (typeof offerId !== "string" || !stateOffers(state).some((offer) => offer.id === offerId)) return;
      queuePatch(sdk, [
        { op: "set", path: "/state/selected-offer", value: offerId },
        { op: "set", path: "/state/booking-step", value: "fare" },
        { op: "set", path: "/state/fare-bundle", value: null },
        { op: "set", path: "/state/fare-total", value: 0 },
        { op: "set", path: "/state/passenger-details", value: [] },
        { op: "set", path: "/state/contact", value: null },
        { op: "set", path: "/state/seat-selections", value: [] },
        { op: "set", path: "/state/baggage-selections", value: [] },
        { op: "set", path: "/state/insurance-id", value: "none" },
        { op: "set", path: "/state/insurance-total", value: 0 },
        { op: "set", path: "/state/extras", value: [] },
        { op: "set", path: "/state/extras-total", value: 0 },
        { op: "set", path: "/state/payment-handoff", value: null },
      ]);
      return;
    }

    if (effect.action.type === "travel.flight.fare.select") {
      const fare = fareById(effect.action.payload.fareId);
      const offer = selectedOffer(state);
      const base = offer ? numberValue(offer.price) : undefined;
      if (!fare || base === undefined) return;
      queuePatch(sdk, [
        { op: "set", path: "/state/fare-bundle", value: fare.id },
        { op: "set", path: "/state/fare-total", value: base + fare.perPassengerExtra * count },
        { op: "set", path: "/state/booking-step", value: "passengers" },
      ]);
      return;
    }

    if (effect.action.type === "travel.flight.passenger.submit") {
      const rawPassengers = effect.action.payload.passengers;
      const contact = objectValue(effect.action.payload.contact);
      const passengers = objectArray(rawPassengers);
      if (passengers.length !== count || !contact) return;
      const validPassengers = passengers.every((person) =>
        textValue(person.firstName) && textValue(person.lastName) && textValue(person.birthDate));
      if (!validPassengers || !textValue(contact.email) || !textValue(contact.phone)) return;
      queuePatch(sdk, [
        { op: "set", path: "/state/passenger-details", value: passengers },
        { op: "set", path: "/state/contact", value: contact },
        { op: "set", path: "/state/booking-step", value: "seats" },
      ]);
      return;
    }

    if (effect.action.type === "travel.flight.seat.select") {
      const passengerIndex = numberValue(effect.action.payload.passengerIndex);
      const seat = seatById(effect.action.payload.seat);
      if (passengerIndex === undefined || !Number.isInteger(passengerIndex) || passengerIndex < 0 || passengerIndex >= count) return;
      if (!seat || seat.occupied) return;
      const existing = objectArray(state.plan.state["seat-selections"]);
      if (existing.some((entry) => entry.seat === seat.id && entry.passengerIndex !== passengerIndex)) return;
      const fareId = textValue(state.plan.state["fare-bundle"]);
      const next = replacePassengerSelection(existing, passengerIndex, {
        passengerIndex,
        seat: seat.id,
        fee: seatFeeForFare(seat, fareId),
      });
      queuePatch(sdk, [
        { op: "set", path: "/state/seat-selections", value: next },
        ...(next.length >= count ? [{ op: "set", path: "/state/booking-step", value: "baggage" }] : []),
      ]);
      return;
    }

    if (effect.action.type === "travel.flight.baggage.select") {
      const option = baggageById(effect.action.payload.optionId);
      if (!option) return;
      const fareId = textValue(state.plan.state["fare-bundle"]);
      const fee = baggageFeeForFare(option, fareId);
      const existing = objectArray(state.plan.state["baggage-selections"]);
      let next: JsonObject[];
      if (effect.action.payload.applyToAll === true) {
        next = Array.from({ length: count }, (_, passengerIndex) => ({
          passengerIndex,
          optionId: option.id,
          kilograms: option.kilograms,
          fee,
        }));
      } else {
        const passengerIndex = numberValue(effect.action.payload.passengerIndex);
        if (passengerIndex === undefined || !Number.isInteger(passengerIndex) || passengerIndex < 0 || passengerIndex >= count) return;
        next = replacePassengerSelection(existing, passengerIndex, {
          passengerIndex,
          optionId: option.id,
          kilograms: option.kilograms,
          fee,
        });
      }
      queuePatch(sdk, [
        { op: "set", path: "/state/baggage-selections", value: next },
        ...(next.length >= count ? [{ op: "set", path: "/state/booking-step", value: "extras" }] : []),
      ]);
      return;
    }

    if (effect.action.type === "travel.flight.extras.submit") {
      const insurance = insuranceById(effect.action.payload.insuranceId);
      const requestedExtras = stringArray(effect.action.payload.extras);
      const extras = requestedExtras.flatMap((id) => extraById(id) ? [id] : []);
      if (!insurance || extras.length !== requestedExtras.length) return;
      const fareId = textValue(state.plan.state["fare-bundle"]);
      const extrasTotal = extras.reduce((sum, id) => {
        const option = extraById(id);
        return option ? sum + extraFeeForFare(option, fareId) * count : sum;
      }, 0);
      queuePatch(sdk, [
        { op: "set", path: "/state/insurance-id", value: insurance.id },
        { op: "set", path: "/state/insurance-total", value: insurance.feePerPassenger * count },
        { op: "set", path: "/state/extras", value: extras },
        { op: "set", path: "/state/extras-total", value: extrasTotal },
        { op: "set", path: "/state/booking-step", value: "review" },
      ]);
      return;
    }

    if (effect.action.type === "travel.flight.booking.handoff") {
      const offer = selectedOffer(state);
      const currency = offer ? textValue(offer.currency) ?? "EUR" : "EUR";
      const total = bookingTotal(state);
      queuePatch(sdk, [
        { op: "set", path: "/state/booking-total", value: total },
        {
          op: "set",
          path: "/state/payment-handoff",
          value: {
            status: "ready",
            destination: "airline-secure-checkout",
            amount: total,
            currency,
          },
        },
        { op: "set", path: "/state/booking-step", value: "handoff" },
      ]);
      return;
    }

    if (effect.action.type === "travel.flight.assistant.command") {
      const command = textValue(effect.action.payload.command);
      const value = textValue(effect.action.payload.value);
      if (!command) return;
      handleAssistantCommand(sdk, state, command, value, result.input.passengers);
    }
  };

  return (
    <>
      <div
        ref={setContainer}
        className="vira-experience"
        aria-label="Interactive flight booking"
      />
      {controller && configuration ? (
        <ViraExperience
          ref={handleRef}
          configuration={configuration}
          experience={experience}
          onReady={(sdk) => {
            sdkIdentityRef.current = sdk;
            activeViraSdk = sdk;
            controller.bindDispatch((event) => { sdk.dispatch(event); });
            const state = sdk.currentState();
            if (state) controller.renderState(state);
          }}
          onEffect={handleEffect}
          onStateChange={(state) => controller.renderState(state)}
          onConfigurationError={() => controller.showError("Vira configuration could not be loaded.")}
          onMountResult={(mount) => {
            if (!mount.ok) controller.showError("Vira experience could not be mounted.");
          }}
          onWrapperError={() => controller.showError("Vira integration could not start.")}
          onError={() => controller.showError("Vira stopped this experience safely.")}
        />
      ) : null}
    </>
  );
}

function ViraCommandEffect({ result }: { result: ViraCommandResult }) {
  const dispatched = useRef(false);
  useEffect(() => {
    if (dispatched.current || !activeViraSdk) return;
    dispatched.current = true;
    activeViraSdk.dispatch({
      event: "assistant.command",
      payload: {
        command: result.command,
        ...(result.value === undefined ? {} : { value: result.value }),
      },
    });
  }, [result]);
  return null;
}

export const viraChatToolkit = defineToolkit({
  vira_present_experience: {
    type: "backend",
    display: "standalone",
    render: ({ result, status }) => {
      if (status.type === "running" || result === undefined) {
        return (
          <div className="flight-loading" aria-live="polite">
            <span className="flight-loading-dot" />
            Preparing your flight options…
          </div>
        );
      }
      if (!isViraFlightExperienceResult(result)) {
        return <div className="flight-error">This Vira experience could not be displayed.</div>;
      }
      return <AirlineViraExperience result={result} />;
    },
  },
  vira_interact: {
    type: "backend",
    display: "standalone",
    render: ({ result }) => {
      if (!isViraCommandResult(result)) return null;
      return <ViraCommandEffect result={result} />;
    },
  },
});
