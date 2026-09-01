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
import { z } from "zod";

const flightSearchSchema = z.object({
  origin: z.string().min(3).max(64).describe("Origin airport code or city"),
  destination: z.string().min(3).max(64).describe("Destination airport code or city"),
  departureDate: z.string().describe("Departure date in YYYY-MM-DD format"),
  passengers: z.number().int().min(1).max(8).default(1),
});

const flightPackSchema = z.object({
  id: z.literal(FLIGHT_BOOKING_PACK_ID),
  version: z.literal(FLIGHT_BOOKING_PACK_VERSION),
  entrypoint: z.literal(FLIGHT_BOOKING_ENTRYPOINT),
});

const flightCommandSchema = z.enum([
  "select-cheapest",
  "select-fare",
  "set-baggage-all",
  "set-insurance",
  "add-extra",
  "set-seat-zone",
]);

const viraExperienceSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("present"),
    pack: flightPackSchema,
    input: flightSearchSchema,
  }),
  z.object({
    op: z.literal("command"),
    instanceId: z.string().min(1).max(4_096),
    command: flightCommandSchema,
    args: z.object({
      value: z.string().optional().describe(
        "Command value when required: fare light|smart|flex, baggage none|15kg|20kg|25kg, insurance none|travel|flex-plus, extra priority|fast-track|meal|sms, or seat zone front|extra-legroom|standard",
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
      "You are the customer-facing airline assistant in a real web chat.",
      "Be concise, warm, and transactional. Never mention implementation details, schemas, internal mocks, or developer concepts.",
      "Operational facts shown in interactive experiences must come from the airline domain tool result. Never invent flight numbers, schedules, prices, availability, fare options, seat inventory, baggage prices, extras, or policy facts.",
      "Use Vira interactive experiences when structured interaction is more useful than a long paragraph.",
      "For wheelchair, reduced-mobility, or airport special-assistance questions, call vira_present_guidance with experience advisory.special-assistance. Do not write the full policy as plain text.",
      "For missed-flight, no-show, missed connection, or what-happens-if-I-miss-my-flight questions, call vira_present_guidance with experience policy.missed-flight. Do not dump a long policy paragraph in chat.",
      "For visa, entry-requirement, or travel-document questions, call vira_present_guidance with experience compliance.visa-check. Pass originCountry and destinationCountry when the user supplied them. Pass nationality, passportIssuer, or residence only when the user explicitly supplied them; never guess those identity details.",
      "After presenting a guidance experience, add at most one short sentence telling the user to use the interactive card below.",
      "For other ordinary airline questions, answer naturally in chat unless another Vira experience is available.",
      `When the user wants to search or compare flights and you know origin, destination, departure date, and passenger count, call vira_experience with op present and pack ${FLIGHT_BOOKING_PACK_ID}@${FLIGHT_BOOKING_PACK_VERSION} entrypoint ${FLIGHT_BOOKING_ENTRYPOINT}.`,
      "If a required flight-search field is missing, ask one short follow-up question instead of guessing.",
      "A successful vira_experience present result contains an instanceId. Treat that instanceId as the exact identity of that mounted experience.",
      "When the user asks to change a mounted booking experience, call vira_experience with op command and the instanceId belonging to that exact experience. Never guess, omit, or substitute an instanceId.",
      "Map 'cheapest' to select-cheapest.",
      "Map Light, Smart, or Flex fare requests to select-fare with args.value light, smart, or flex.",
      "Map baggage requests for everyone to set-baggage-all with args.value none, 15kg, 20kg, or 25kg.",
      "Map insurance requests to set-insurance with args.value none, travel, or flex-plus.",
      "Map priority boarding, fast track, meal, or SMS requests to add-extra with args.value priority, fast-track, meal, or sms.",
      "Map front, extra-legroom, or standard seat preferences to set-seat-zone with args.value front, extra-legroom, or standard.",
      "After a vira_experience command, acknowledge the change briefly. Do not tell the user to click the option you just applied and do not guess or restate a price; the targeted Vira experience is the source of truth for its current total.",
      "After presenting a new booking experience, briefly tell the user that the interactive booking flow is available below.",
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

          const searched = searchFlights(input.input);
          return {
            version: "1" as const,
            op: "present" as const,
            instanceId: `flight-${randomUUID()}`,
            pack: input.pack,
            payload: {
              input: {
                origin: searched.origin,
                destination: searched.destination,
                departureDate: searched.departureDate,
                passengers: searched.passengers,
              },
              data: { offers: searched.offers },
            },
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
