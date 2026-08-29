import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  zodSchema,
  type UIMessage,
} from "ai";
import { z } from "zod";

const flightSearchSchema = z.object({
  origin: z.string().min(3).max(64).describe("Origin airport code or city"),
  destination: z.string().min(3).max(64).describe("Destination airport code or city"),
  departureDate: z.string().describe("Departure date in YYYY-MM-DD format"),
  passengers: z.number().int().min(1).max(8).default(1),
});

const viraExperienceSchema = z.object({
  experience: z.literal("travel.flight.search"),
  input: flightSearchSchema,
});

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

const viraCommandSchema = z.object({
  command: z.enum([
    "select-cheapest",
    "select-fare",
    "set-baggage-all",
    "set-insurance",
    "add-extra",
    "set-seat-zone",
  ]),
  value: z.string().optional().describe(
    "Command value when required: fare light|smart|flex, baggage none|15kg|20kg|25kg, insurance none|travel|flex-plus, extra priority|fast-track|meal|sms, or seat zone front|extra-legroom|standard",
  ),
});

type FlightSearchInput = z.infer<typeof flightSearchSchema>;
type GuidanceExperience = z.infer<typeof viraGuidanceSchema>["experience"];

function airportCode(value: string, fallback: string): string {
  const normalized = value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(normalized)) return normalized;
  const known: Record<string, string> = {
    ISTANBUL: "SAW",
    BERLIN: "BER",
    LONDON: "STN",
    ROME: "FCO",
    PARIS: "ORY",
    AMSTERDAM: "AMS",
    ANTALYA: "AYT",
    IZMIR: "ADB",
  };
  return known[normalized] ?? fallback;
}

function demoOffers(input: FlightSearchInput) {
  const origin = airportCode(input.origin, "SAW");
  const destination = airportCode(input.destination, "BER");
  const multiplier = input.passengers;
  return [
    {
      id: "PC-981",
      carrier: "Pegasus",
      flightNumber: "PC 981",
      origin,
      destination,
      departure: "09:20",
      arrival: "11:10",
      duration: "2h 50m",
      price: 89 * multiplier,
      currency: "EUR",
    },
    {
      id: "PC-983",
      carrier: "Pegasus",
      flightNumber: "PC 983",
      origin,
      destination,
      departure: "13:45",
      arrival: "15:35",
      duration: "2h 50m",
      price: 104 * multiplier,
      currency: "EUR",
    },
    {
      id: "PC-985",
      carrier: "Pegasus",
      flightNumber: "PC 985",
      origin,
      destination,
      departure: "19:10",
      arrival: "21:00",
      duration: "2h 50m",
      price: 118 * multiplier,
      currency: "EUR",
    },
  ];
}

function guidanceData(experience: GuidanceExperience) {
  if (experience === "advisory.special-assistance") {
    return {
      summary: "Wheelchair assistance can be requested during booking. For this comparison demo, the guidance reflects the 48-hour lead-time rule shown by the airline assistant you are comparing against.",
      deadline: "At booking or at least 48 hours before departure",
      types: [
        { id: "WCHR", title: "Ramp assistance", copy: "Passenger can use stairs but needs help reaching the aircraft." },
        { id: "WCHS", title: "Aircraft-door assistance", copy: "Passenger cannot use stairs and needs assistance to the aircraft door." },
        { id: "WCHC", title: "Cabin-seat assistance", copy: "Passenger cannot walk inside the aircraft and needs assistance to the seat." },
      ],
      notes: [
        "Requests made with less lead time may not be fulfilled on time.",
        "Wheelchair or battery/device details may be required before travel.",
        "The airline may apply operational capacity limits on a flight.",
      ],
    };
  }

  if (experience === "policy.missed-flight") {
    return {
      summary: "Missing a flight can trigger different rules depending on timing and itinerary. Use the scenarios instead of reading one long policy paragraph.",
      scenarios: [
        {
          id: "before-departure",
          label: "Before departure",
          title: "You still have time to act",
          points: [
            "Check whether your fare allows a change before the scheduled departure.",
            "Fees and fare differences depend on the ticket conditions.",
            "Acting before the no-show window is usually better than waiting until after departure.",
          ],
          nextAction: "Check the selected fare rules or contact airline support before departure.",
        },
        {
          id: "no-show",
          label: "No-show",
          title: "The ticket may be treated as a no-show",
          points: [
            "The comparison airline assistant states that requests less than 2 hours before departure or after departure are treated as no-show.",
            "It states that ticket changes are not available in that case.",
            "It states that only the airport tax is refundable while base fare and listed service charges are not refunded.",
          ],
          nextAction: "Check the live rules attached to your actual ticket before taking action.",
        },
        {
          id: "round-trip",
          label: "Round-trip",
          title: "The other direction may remain usable",
          points: [
            "The comparison airline assistant states that missing one direction does not automatically invalidate the other direction.",
            "Keep the booking reference and check the remaining sector status before travel.",
          ],
          nextAction: "Verify the remaining flight status in the booking before going to the airport.",
        },
        {
          id: "connection",
          label: "Connection",
          title: "A later sector may still be available",
          points: [
            "The comparison airline assistant states that missing the first leg does not automatically prevent boarding the next leg.",
            "Connection handling can depend on how the itinerary was ticketed, so live booking verification matters.",
          ],
          nextAction: "Check the actual itinerary status and connection conditions with the airline.",
        },
      ],
    };
  }

  return {
    summary: "Visa and entry requirements depend on the traveler's nationality, passport issuer and residence status. The demo collects those details but does not pretend to have Timatic access.",
    officialCheck: "Timatic or an authorized immigration/airline source",
  };
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
      "Use Vira interactive experiences when structured interaction is more useful than a long paragraph.",
      "For wheelchair, reduced-mobility, or airport special-assistance questions, call vira_present_guidance with experience advisory.special-assistance. Do not write the full policy as plain text.",
      "For missed-flight, no-show, missed connection, or what-happens-if-I-miss-my-flight questions, call vira_present_guidance with experience policy.missed-flight. Do not dump a long policy paragraph in chat.",
      "For visa, entry-requirement, or travel-document questions, call vira_present_guidance with experience compliance.visa-check. Pass originCountry and destinationCountry when the user supplied them. Pass nationality, passportIssuer, or residence only when the user explicitly supplied them; never guess those identity details.",
      "After presenting a guidance experience, add at most one short sentence telling the user to use the interactive card below.",
      "For other ordinary airline questions, answer naturally in chat unless another Vira experience is available.",
      "Do not invent exact airline policy details such as baggage dimensions, fees, or refund rules when they are not present in the conversation or interactive experience.",
      "When the user wants to search or compare flights and you know origin, destination, departure date, and passenger count, call vira_present_experience with experience travel.flight.search.",
      "If a required flight-search field is missing, ask one short follow-up question instead of guessing.",
      "When an interactive flight booking experience is already present in the conversation and the user asks to act on it, call vira_interact instead of only describing what they should click.",
      "Map 'cheapest' to select-cheapest.",
      "Map Light, Smart, or Flex fare requests to select-fare with value light, smart, or flex.",
      "Map baggage requests for everyone to set-baggage-all with one of none, 15kg, 20kg, or 25kg.",
      "Map insurance requests to set-insurance with none, travel, or flex-plus.",
      "Map priority boarding, fast track, meal, or SMS requests to add-extra with priority, fast-track, meal, or sms.",
      "Map front, extra-legroom, or standard seat preferences to set-seat-zone with front, extra-legroom, or standard.",
      "After calling vira_interact, acknowledge the change briefly. Do not tell the user to click the option you just applied and do not guess or restate a price; the mounted Vira experience is the source of truth for the current total.",
      "After presenting a new booking experience, briefly tell the user that the interactive booking flow is available below.",
    ].join("\n"),
    messages: await convertToModelMessages(body.messages),
    stopWhen: stepCountIs(5),
    tools: {
      vira_present_experience: tool({
        description: "Present a Vira interactive airline booking experience inside the chat.",
        inputSchema: zodSchema(viraExperienceSchema),
        execute: async ({ experience, input }) => ({
          version: "1" as const,
          kind: "vira.experience" as const,
          experience,
          input,
          data: { offers: demoOffers(input) },
        }),
      }),
      vira_present_guidance: tool({
        description: "Present a structured Vira airline guidance experience instead of a long text answer. Supports special assistance, missed-flight policy scenarios, and visa/document checks.",
        inputSchema: zodSchema(viraGuidanceSchema),
        execute: async ({ experience, input }) => ({
          version: "1" as const,
          kind: "vira.experience" as const,
          experience,
          input: Object.fromEntries(
            Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
          ),
          data: guidanceData(experience),
        }),
      }),
      vira_interact: tool({
        description: "Send an action to the currently mounted Vira airline booking experience in the chat.",
        inputSchema: zodSchema(viraCommandSchema),
        execute: async ({ command, value }) => ({
          version: "1" as const,
          kind: "vira.command" as const,
          command,
          ...(value === undefined ? {} : { value }),
        }),
      }),
    },
  });

  return result.toUIMessageStreamResponse({ originalMessages: body.messages });
}
