import { randomUUID } from "node:crypto";
import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  zodSchema,
  type UIMessage,
} from "ai";
import {
  FLIGHT_BOOKING_ENTRYPOINT,
  FLIGHT_BOOKING_PACK_ID,
  FLIGHT_BOOKING_PACK_VERSION,
} from "@vira-enterprise-genui/airline-brand-kit/chat-publication";
import {
  getMissedFlightGuidance,
  getSpecialAssistanceGuidance,
  getVisaGuidance,
  searchFlights,
} from "@vira-enterprise-genui/mock-airline-domain";
import {
  RECIPE_CARD_ENTRYPOINT,
  RECIPE_CARD_PACK_ID,
  RECIPE_CARD_PACK_VERSION,
  createRecipePayload,
} from "@vira-enterprise-genui/recipe-brand-kit";
import { z } from "zod";

const flightSearchSchema = z.object({
  origin: z.string().min(3).max(64).describe("Origin airport code or city"),
  destination: z.string().min(3).max(64).describe("Destination airport code or city"),
  departureDate: z.string().describe("Departure date in YYYY-MM-DD format"),
  passengers: z.number().int().min(1).max(8).default(1),
});

const recipeInputSchema = z.object({
  dish: z.enum(["shakshuka", "tomato-pasta", "pancakes"]),
  servings: z.number().int().min(1).max(12).default(4),
});

const flightPackSchema = z.object({
  id: z.literal(FLIGHT_BOOKING_PACK_ID),
  version: z.literal(FLIGHT_BOOKING_PACK_VERSION),
  entrypoint: z.literal(FLIGHT_BOOKING_ENTRYPOINT),
});

const recipePackSchema = z.object({
  id: z.literal(RECIPE_CARD_PACK_ID),
  version: z.literal(RECIPE_CARD_PACK_VERSION),
  entrypoint: z.literal(RECIPE_CARD_ENTRYPOINT),
});

const commandSchema = z.enum([
  "select-cheapest",
  "select-fare",
  "set-baggage-all",
  "set-insurance",
  "add-extra",
  "set-seat-zone",
  "increase-servings",
  "decrease-servings",
  "toggle-favorite",
]);

const presentSchema = z.union([
  z.object({ op: z.literal("present"), pack: flightPackSchema, input: flightSearchSchema }),
  z.object({ op: z.literal("present"), pack: recipePackSchema, input: recipeInputSchema }),
]);

const viraExperienceSchema = z.union([
  presentSchema,
  z.object({
    op: z.literal("command"),
    instanceId: z.string().min(1).max(4_096),
    command: commandSchema,
    args: z.object({
      value: z.string().optional().describe(
        "Optional command value for Flight commands: fare light|smart|flex, baggage none|15kg|20kg|25kg, insurance none|travel|flex-plus, extra priority|fast-track|meal|sms, or seat zone front|extra-legroom|standard",
      ),
    }).default({}),
  }),
]);

const viraGuidanceSchema = z.object({
  experience: z.enum([
    "advisory.special-assistance",
    "policy.missed-flight",
    "compliance.visa-check",
  ]),
  input: z.object({
    originCountry: z.string().optional(),
    destinationCountry: z.string().optional(),
    nationality: z.string().optional(),
    passportIssuer: z.string().optional(),
    residence: z.string().optional(),
  }).default({}),
});

type GuidanceExperience = z.infer<typeof viraGuidanceSchema>["experience"];
type GuidanceInput = z.infer<typeof viraGuidanceSchema>["input"];
type Presenter = (input: unknown) => Readonly<Record<string, unknown>>;

function packKey(pack: { readonly id: string; readonly version: string; readonly entrypoint: string }): string {
  return `${pack.id}@${pack.version}:${pack.entrypoint}`;
}

const presenters = new Map<string, Presenter>([
  [
    packKey({ id: FLIGHT_BOOKING_PACK_ID, version: FLIGHT_BOOKING_PACK_VERSION, entrypoint: FLIGHT_BOOKING_ENTRYPOINT }),
    (input) => {
      const parsed = flightSearchSchema.parse(input);
      const searched = searchFlights(parsed);
      return {
        input: {
          origin: searched.origin,
          destination: searched.destination,
          departureDate: searched.departureDate,
          passengers: searched.passengers,
        },
        data: { offers: searched.offers },
      };
    },
  ],
  [
    packKey({ id: RECIPE_CARD_PACK_ID, version: RECIPE_CARD_PACK_VERSION, entrypoint: RECIPE_CARD_ENTRYPOINT }),
    (input) => createRecipePayload(recipeInputSchema.parse(input)),
  ],
]);

function guidanceData(experience: GuidanceExperience, input: GuidanceInput): Readonly<Record<string, unknown>> {
  if (experience === "advisory.special-assistance") return getSpecialAssistanceGuidance();
  if (experience === "policy.missed-flight") return getMissedFlightGuidance();
  return getVisaGuidance(input);
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_API_KEY is required for the real LLM demo." },
      { status: 500 },
    );
  }

  const body = await request.json() as { messages?: UIMessage[] };
  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "messages must be an array" }, { status: 400 });
  }

  const provider = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
  });
  const model = provider(process.env.OPENAI_MODEL ?? "gpt-5.6-luna");

  const result = streamText({
    model,
    system: [
      "You are Vira, a concise customer-facing assistant. Never mention implementation details, schemas, internal mocks, or developer concepts.",
      "Use Vira interactive experiences when structured interaction is more useful than a long paragraph.",
      "For airline operational facts, use the airline domain tool result. Never invent flight numbers, schedules, prices, availability, fare options, seat inventory, baggage prices, extras, or policy facts.",
      "For wheelchair, reduced-mobility, or airport special-assistance questions, call vira_present_guidance with experience advisory.special-assistance. Do not write the full policy as plain text.",
      "For missed-flight, no-show, missed connection, or what-happens-if-I-miss-my-flight questions, call vira_present_guidance with experience policy.missed-flight. Do not dump a long policy paragraph in chat.",
      "For visa, entry-requirement, or travel-document questions, call vira_present_guidance with experience compliance.visa-check. Pass originCountry and destinationCountry when supplied. Pass nationality, passportIssuer, or residence only when explicitly supplied; never guess identity details.",
      "After presenting a guidance experience, add at most one short sentence telling the user to use the interactive card below.",
      `When the user wants to search or compare flights and origin, destination, departure date, and passenger count are known, call vira_experience with op present and pack ${FLIGHT_BOOKING_PACK_ID}@${FLIGHT_BOOKING_PACK_VERSION} entrypoint ${FLIGHT_BOOKING_ENTRYPOINT}.`,
      "If a required flight-search field is missing, ask one short follow-up question instead of guessing.",
      `For an interactive recipe request for Shakshuka, One-Pan Tomato Pasta, or Fluffy Breakfast Pancakes, call vira_experience with op present and pack ${RECIPE_CARD_PACK_ID}@${RECIPE_CARD_PACK_VERSION} entrypoint ${RECIPE_CARD_ENTRYPOINT}. Use dish shakshuka, tomato-pasta, or pancakes and the requested serving count.`,
      "A successful vira_experience present result contains an instanceId. Treat that instanceId as the exact identity of that mounted experience.",
      "When multiple Vira experiences exist in the conversation, a command must target the instanceId belonging to the exact experience the user referred to. Never use the newest or latest experience as an implicit target.",
      "For Flight: map cheapest to select-cheapest; Light/Smart/Flex to select-fare; baggage for everyone to set-baggage-all; insurance to set-insurance; priority/fast track/meal/SMS to add-extra; seat preferences to set-seat-zone.",
      "For Recipe: map 'one more serving' or increase servings to increase-servings; reduce servings to decrease-servings; save/favorite or unsave to toggle-favorite.",
      "After a vira_experience command, acknowledge the change briefly. The targeted interactive experience is the source of truth for its current state.",
      "After presenting a new experience, briefly tell the user that the interactive experience is available below.",
    ].join("\n"),
    messages: await convertToModelMessages(body.messages),
    stopWhen: stepCountIs(5),
    tools: {
      vira_experience: tool({
        description: "Present or command a registered Vira Experience Pack inside the chat.",
        inputSchema: zodSchema(viraExperienceSchema),
        execute: async (input) => {
          if (input.op === "command") {
            return {
              version: "1" as const,
              op: "command" as const,
              instanceId: input.instanceId,
              command: input.command,
              args: input.args,
            };
          }

          const presenter = presenters.get(packKey(input.pack));
          if (!presenter) throw new Error("requested Vira Experience Pack is not registered");
          return {
            version: "1" as const,
            op: "present" as const,
            instanceId: `experience-${randomUUID()}`,
            pack: input.pack,
            payload: presenter(input.input),
          };
        },
      }),
      vira_present_guidance: tool({
        description: "Read the airline domain guidance data and present it as an interactive Vira experience.",
        inputSchema: zodSchema(viraGuidanceSchema),
        execute: async ({ experience, input }) => ({
          version: "1" as const,
          kind: "vira.experience" as const,
          experience,
          input: Object.fromEntries(
            Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
          ),
          data: guidanceData(experience, input),
        }),
      }),
    },
  });

  return result.toUIMessageStreamResponse({ originalMessages: body.messages });
}
