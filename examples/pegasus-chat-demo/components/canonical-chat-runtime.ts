import {
  baggageById,
  extraById,
  fareById,
  insuranceById,
  seatById,
} from "@vira-enterprise-genui/airline-brand-kit";
import {
  createViraExperienceRuntime,
  prepareAuthoredStudioPublication,
  type ViraExperienceRuntime,
} from "@vira-enterprise-genui/genui";
import { searchFlights } from "@vira-enterprise-genui/mock-airline-domain";
import { createRuntimeState } from "@vira-enterprise-genui/runtime-core";
import type { FlightOffer, ViraFlightExperienceResult } from "../lib/vira-chat-contract";
import {
  CANONICAL_CHAT_ACTION_ADAPTER,
  CANONICAL_CHAT_BINDING_SOURCE_CATALOG,
  CANONICAL_CHAT_COMPONENT_CATALOG,
  CANONICAL_CHAT_PERMISSION_POLICY,
  createCanonicalChatDocument,
} from "./canonical-chat-studio-contracts";

function runtimeState() {
  const result = createRuntimeState("pegasus-chat-studio", {
    version: "1",
    id: "pegasus-chat-studio-plan",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  return result.ok ? result.value : undefined;
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    if (Object.getOwnPropertySymbols(value).length > 0
      || Object.getOwnPropertyNames(value).length !== Object.keys(value).length) return undefined;
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) return undefined;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return undefined;
  }
}

export interface CanonicalChatRuntimeBundle {
  readonly runtime: ViraExperienceRuntime;
  readonly offers: () => readonly FlightOffer[];
}

export function createCanonicalChatRuntime(
  result: ViraFlightExperienceResult,
): CanonicalChatRuntimeBundle | undefined {
  const state = runtimeState();
  if (!state) return undefined;

  const publication = prepareAuthoredStudioPublication({
    document: createCanonicalChatDocument(result),
    componentCatalog: CANONICAL_CHAT_COMPONENT_CATALOG,
    bindingSourceCatalog: CANONICAL_CHAT_BINDING_SOURCE_CATALOG,
    actionAdapter: CANONICAL_CHAT_ACTION_ADAPTER,
  });
  if (!publication.ok) return undefined;

  let revision = 1;
  let searchInput = { ...result.input };
  let offers: readonly FlightOffer[] = [...result.data.offers];
  let selectedOfferId: string | undefined;
  let selectedFare = "smart";
  let selectedInsurance = "none";
  const selectedExtras = new Set<string>();

  const selectedOffer = (): FlightOffer | undefined =>
    offers.find((offer) => offer.id === selectedOfferId) ?? offers[0];

  const snapshot = () => {
    const offer = selectedOffer();
    const price = offer?.price ?? 0;
    const currency = offer?.currency ?? "EUR";
    return {
      version: "1" as const,
      revision,
      state: {
        "selected-offer": selectedOfferId ?? null,
        "fare-bundle": selectedFare,
        "insurance-id": selectedInsurance,
        extras: [...selectedExtras],
      },
      domain: {
        results: {
          origin: searchInput.origin,
          destination: searchInput.destination,
          departure: searchInput.departureDate,
          passengers: searchInput.passengers,
          "base-price": price,
          currency,
        },
        booking: {
          passengers: searchInput.passengers,
          fare: selectedFare,
        },
        review: {
          origin: searchInput.origin,
          destination: searchInput.destination,
          passengers: searchInput.passengers,
          fare: selectedFare,
          "base-price": price,
          currency,
        },
      },
    };
  };

  const success = () => {
    revision += 1;
    return { outcome: "success" as const, snapshot: snapshot() };
  };
  const error = () => ({ outcome: "error" as const });

  const host = {
    version: "1",
    id: "pegasus.chat.approved-host",
    snapshot,
    dispatch: async (action: unknown) => {
      const actionRecord = record(action);
      const type = actionRecord?.type;
      const payload = record(actionRecord?.payload) ?? {};

      if (type === "travel.flight.search.submit") {
        if (typeof payload.origin !== "string"
          || typeof payload.destination !== "string"
          || typeof payload.departureDate !== "string"
          || typeof payload.passengers !== "number"
          || !Number.isInteger(payload.passengers)) return error();
        try {
          const searched = searchFlights({
            origin: payload.origin,
            destination: payload.destination,
            departureDate: payload.departureDate,
            passengers: payload.passengers,
          });
          searchInput = {
            origin: searched.origin,
            destination: searched.destination,
            departureDate: searched.departureDate,
            passengers: searched.passengers,
          };
          offers = searched.offers;
          selectedOfferId = undefined;
          selectedFare = "smart";
          selectedInsurance = "none";
          selectedExtras.clear();
          return success();
        } catch {
          return error();
        }
      }

      if (type === "travel.flight.offer.select") {
        const offerId = typeof payload.offerId === "string" ? payload.offerId : undefined;
        if (!offerId || !offers.some((offer) => offer.id === offerId)) return error();
        selectedOfferId = offerId;
        return success();
      }

      if (type === "travel.flight.fare.select") {
        const fare = fareById(payload.fareId);
        if (!fare) return error();
        selectedFare = fare.id;
        return success();
      }

      if (type === "travel.flight.seat.select") {
        if (!seatById(payload.seat)) return error();
        return success();
      }

      if (type === "travel.flight.baggage.select") {
        if (!baggageById(payload.optionId)) return error();
        return success();
      }

      if (type === "travel.flight.extras.submit") {
        const insurance = insuranceById(payload.insuranceId);
        const extras = Array.isArray(payload.extras)
          ? payload.extras.filter((entry): entry is string => typeof entry === "string")
          : undefined;
        if (!insurance || !extras || extras.some((id) => !extraById(id))) return error();
        selectedInsurance = insurance.id;
        selectedExtras.clear();
        for (const id of extras) selectedExtras.add(id);
        return success();
      }

      if (type === "travel.flight.assistant.command") {
        if (payload.command === "set-insurance") {
          const insurance = insuranceById(payload.value);
          if (!insurance) return error();
          selectedInsurance = insurance.id;
          return success();
        }
        if (payload.command === "add-extra") {
          const extra = extraById(payload.value);
          if (!extra) return error();
          selectedExtras.add(extra.id);
          return success();
        }
        return error();
      }

      if (type === "travel.flight.passenger.submit"
        || type === "travel.flight.booking.handoff") {
        return success();
      }

      return error();
    },
    subscribe: () => () => {},
  };

  const runtime = createViraExperienceRuntime({
    publication: publication.value,
    componentCatalog: CANONICAL_CHAT_COMPONENT_CATALOG,
    bindingSourceCatalog: CANONICAL_CHAT_BINDING_SOURCE_CATALOG,
    actionAdapter: CANONICAL_CHAT_ACTION_ADAPTER,
    runtimeState: state,
    permissionPolicy: CANONICAL_CHAT_PERMISSION_POLICY,
    host,
  });

  return runtime.ok
    ? Object.freeze({ runtime: runtime.value, offers: () => offers })
    : undefined;
}
