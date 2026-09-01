import { randomUUID } from "node:crypto";
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
import { z } from "zod";

const packIdentitySchema = z.object({
  id: z.string().min(1).max(4_096),
  version: z.string().min(1).max(4_096),
  entrypoint: z.string().min(1).max(4_096),
});

const flightSearchSchema = z.object({
  origin: z.string().min(3).max(64),
  destination: z.string().min(3).max(64),
  departureDate: z.string(),
  passengers: z.number().int().min(1).max(8).default(1),
});

const recipeInputSchema = z.object({
  dish: z.enum(["shakshuka", "tomato-pasta", "pancakes"]),
  servings: z.number().int().min(1).max(12).default(4),
});

export const viraExperienceSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("present"),
    pack: packIdentitySchema,
    input: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({
    op: z.literal("command"),
    instanceId: z.string().min(1).max(4_096),
    command: z.string().min(1).max(4_096),
    args: z.record(z.string(), z.unknown()).default({}),
  }),
]);

export type DemoViraExperienceInput = z.infer<typeof viraExperienceSchema>;

type Presenter = Readonly<{
  present: (input: unknown) => Readonly<Record<string, unknown>>;
  instructions: readonly string[];
}>;

function packKey(pack: { readonly id: string; readonly version: string; readonly entrypoint: string }): string {
  return `${pack.id}@${pack.version}:${pack.entrypoint}`;
}

const registrations = Object.freeze([
  Object.freeze({
    pack: Object.freeze({
      id: FLIGHT_BOOKING_PACK_ID,
      version: FLIGHT_BOOKING_PACK_VERSION,
      entrypoint: FLIGHT_BOOKING_ENTRYPOINT,
    }),
    presenter: Object.freeze({
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
    } satisfies Presenter),
  }),
  Object.freeze({
    pack: Object.freeze({
      id: RECIPE_CARD_PACK_ID,
      version: RECIPE_CARD_PACK_VERSION,
      entrypoint: RECIPE_CARD_ENTRYPOINT,
    }),
    presenter: Object.freeze({
      present(input: unknown) {
        return createRecipePayload(recipeInputSchema.parse(input));
      },
      instructions: Object.freeze([
        `For an interactive Shakshuka, One-Pan Tomato Pasta, or Fluffy Breakfast Pancakes recipe, use pack ${RECIPE_CARD_PACK_ID}@${RECIPE_CARD_PACK_VERSION} entrypoint ${RECIPE_CARD_ENTRYPOINT}.`,
        "For that experience: increase servings → increase-servings; reduce servings → decrease-servings; save/favorite/unsave → toggle-favorite.",
      ]),
    } satisfies Presenter),
  }),
]);

const presenters = new Map<string, Presenter>(
  registrations.map((registration) => [packKey(registration.pack), registration.presenter] as const),
);

export const DEMO_EXPERIENCE_SYSTEM_INSTRUCTIONS = Object.freeze(
  registrations.flatMap((registration) => registration.presenter.instructions),
);

export async function executeDemoViraExperience(input: DemoViraExperienceInput) {
  if (input.op === "command") {
    return Object.freeze({
      version: "1" as const,
      op: "command" as const,
      instanceId: input.instanceId,
      command: input.command,
      args: input.args,
    });
  }

  const presenter = presenters.get(packKey(input.pack));
  if (!presenter) throw new Error("requested Vira Experience Pack is not registered");
  return Object.freeze({
    version: "1" as const,
    op: "present" as const,
    instanceId: `experience-${randomUUID()}`,
    pack: Object.freeze({ ...input.pack }),
    payload: presenter.present(input.input),
  });
}
