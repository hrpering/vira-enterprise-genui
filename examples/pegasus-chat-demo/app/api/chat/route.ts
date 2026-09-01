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
  DEMO_EXPERIENCE_SYSTEM_INSTRUCTIONS,
  executeDemoViraExperience,
  viraExperienceSchema,
} from "../../../lib/demo-experience-tool.js";
import {
  DEMO_GUIDANCE_SYSTEM_INSTRUCTIONS,
  executeDemoGuidance,
  viraGuidanceSchema,
} from "../../../lib/demo-guidance-tool.js";

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
      "Use registered Vira interactive experiences when structured interaction is more useful than a long paragraph.",
      "Operational facts shown in an interactive experience must come from the registered presenter result; never invent values that belong to that experience.",
      "A successful vira_experience present result contains an instanceId. Treat that instanceId as the exact identity of that mounted experience.",
      "When multiple Vira experiences exist in the conversation, a command must target the instanceId belonging to the exact experience the user referred to. Never use newest, latest, or global experience state as an implicit target.",
      "After a vira_experience command, acknowledge the change briefly. The targeted interactive experience is the source of truth for its current state.",
      "After presenting a new experience, briefly tell the user that the interactive experience is available below.",
      ...DEMO_EXPERIENCE_SYSTEM_INSTRUCTIONS,
      ...DEMO_GUIDANCE_SYSTEM_INSTRUCTIONS,
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
        description: "Present registered guidance data as an interactive Vira guidance surface.",
        inputSchema: zodSchema(viraGuidanceSchema),
        execute: executeDemoGuidance,
      }),
    },
  });

  return result.toUIMessageStreamResponse({ originalMessages: body.messages });
}
