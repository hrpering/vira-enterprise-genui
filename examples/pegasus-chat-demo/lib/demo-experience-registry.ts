import {
  FLIGHT_BOOKING_ARTIFACT_DIGEST,
  FLIGHT_BOOKING_ENTRYPOINT,
  FLIGHT_BOOKING_PACK_ID,
  FLIGHT_BOOKING_PACK_MANIFEST,
  FLIGHT_BOOKING_PACK_VERSION,
  FLIGHT_BOOKING_PUBLICATION,
} from "@vira-enterprise-genui/airline-brand-kit/chat-publication";
import type { ViraRuntimeCapabilityProfile } from "@vira-enterprise-genui/genui-resolver";
import { searchFlights } from "@vira-enterprise-genui/mock-airline-domain";
import { z } from "zod";
import { FLIGHT_BOOKING_RUNTIME_PROFILE } from "../components/flight-runtime-profile.js";

export interface DemoExperienceRegistration {
  readonly pack: Readonly<{
    id: string;
    version: string;
    entrypoint: string;
  }>;
  readonly manifest: unknown;
  readonly artifact: Readonly<{
    id: string;
    digest: string;
    publication: unknown;
  }>;
  readonly runtimeProfile: ViraRuntimeCapabilityProfile;
  readonly present: (input: unknown) => Readonly<Record<string, unknown>>;
  readonly instructions: readonly string[];
}

const flightSearchSchema = z.object({
  origin: z.string().min(3).max(64),
  destination: z.string().min(3).max(64),
  departureDate: z.string(),
  passengers: z.number().int().min(1).max(8).default(1),
});

const flightRegistration: DemoExperienceRegistration = Object.freeze({
  pack: Object.freeze({
    id: FLIGHT_BOOKING_PACK_ID,
    version: FLIGHT_BOOKING_PACK_VERSION,
    entrypoint: FLIGHT_BOOKING_ENTRYPOINT,
  }),
  manifest: FLIGHT_BOOKING_PACK_MANIFEST,
  artifact: Object.freeze({
    id: FLIGHT_BOOKING_ENTRYPOINT,
    digest: FLIGHT_BOOKING_ARTIFACT_DIGEST,
    publication: FLIGHT_BOOKING_PUBLICATION,
  }),
  runtimeProfile: FLIGHT_BOOKING_RUNTIME_PROFILE,
  present(input: unknown) {
    const parsed = flightSearchSchema.parse(input);
    const searched = searchFlights(parsed);
    return Object.freeze({
      input: Object.freeze({
        origin: searched.origin,
        destination: searched.destination,
        departureDate: searched.departureDate,
        passengers: searched.passengers,
      }),
      data: Object.freeze({ offers: searched.offers }),
    });
  },
  instructions: Object.freeze([
    `For flight search or comparison, use pack ${FLIGHT_BOOKING_PACK_ID}@${FLIGHT_BOOKING_PACK_VERSION} entrypoint ${FLIGHT_BOOKING_ENTRYPOINT} once origin, destination, departure date, and passenger count are known.`,
    "For that experience: cheapest → select-cheapest; Light/Smart/Flex → select-fare; baggage for everyone → set-baggage-all; insurance → set-insurance; priority/fast track/meal/SMS → add-extra; seat preference → set-seat-zone.",
  ]),
});

export const DEMO_EXPERIENCE_REGISTRATIONS: readonly DemoExperienceRegistration[] = Object.freeze([
  flightRegistration,
]);
