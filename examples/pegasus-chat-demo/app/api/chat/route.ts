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
  getMissedFlightGuidance,
  getSpecialAssistanceGuidance,
  getVisaGuidance,
} from "@vira-enterprise-genui/mock-airline-domain";
import { z } from "zod";
import {
  DEMO_EXPERIENCE_SYSTEM_INSTRUCTIONS,
  executeDemoViraExperience,
  viraExperienceSchema,
} from "../../../lib/demo-experience-tool.js";

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
      "Use registered Vira interactive experiences when structured interaction is more useful than a long paragraph.",
      "Operational facts shown in an interactive experience must come from the registered presenter result. Never invent values owned by that experience.",
      "For wheelchair, reduced-mobility, or airport special-assistance questions, call vira_present_guidance with experience advisory.special-assistance. Do not write the full policy as plain text.",
      "For missed-flight, no-show, missed connection, or what-happens-if-I-miss-my-flight questions, call vira_present_guidance with experience policy.missed-flight. Do not dump a long policy paragraph in chat.",
      "For visa, entry-requirement, or travel-document questions, call vira_present_guidance with experience compliance.visa-check. Pass originCountry and destinationCountry when the user supplied them. Pass nationality, passportIssuer, or residence only when the user explicitly supplied them; never guess those identity details.",
      "After presenting a guidance experience, add at most one short sentence telling the user to use the interactive card below.",
      "For other ordinary airline questions, answer naturally in chat unless another Vira experience is available.",
      "A successful vira_experience present result contains an instanceId. Treat that instanceId as the exact identity of that mounted experience.",
      "When multiple Vira experiences exist in the conversation, a command must target the instanceId belonging to the exact experience the user referred to. Never use newest, latest, or global experience state as an implicit target.",
      "After a vira_experience command, acknowledge the change briefly. The targeted interactive experience is the source of truth for its current state.",
      "After presenting a new experience, briefly tell the user that the interactive experience is available below.",
      ...DEMO_EXPERIENCE_SYSTEM_INSTRUCTIONS,
    ].join("\n"),
    messages: await convertToModelMessages(body.messages),
    stopWhen: stepCountIs(5),
    tools: {
      vira_experience: tool({
        description: "Present or command a registered Vira Experience Pack inside the chat.",
        inputSchema: zodSchema(viraExperienceSchema),
        execute: executeDemoViraExperience,
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
