import {
  getMissedFlightGuidance,
  getSpecialAssistanceGuidance,
  getVisaGuidance,
} from "@vira-enterprise-genui/mock-airline-domain";
import { z } from "zod";

export const viraGuidanceSchema = z.object({
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

export type DemoGuidanceInput = z.infer<typeof viraGuidanceSchema>;

export const DEMO_GUIDANCE_SYSTEM_INSTRUCTIONS = Object.freeze([
  "For wheelchair, reduced-mobility, or airport special-assistance questions, call vira_present_guidance with experience advisory.special-assistance.",
  "For missed-flight, no-show, or missed-connection questions, call vira_present_guidance with experience policy.missed-flight.",
  "For visa, entry-requirement, or travel-document questions, call vira_present_guidance with experience compliance.visa-check. Pass identity details only when the user explicitly supplied them.",
]);

export async function executeDemoGuidance({ experience, input }: DemoGuidanceInput) {
  const data = experience === "advisory.special-assistance"
    ? getSpecialAssistanceGuidance()
    : experience === "policy.missed-flight"
      ? getMissedFlightGuidance()
      : getVisaGuidance(input);
  return Object.freeze({
    version: "1" as const,
    kind: "vira.experience" as const,
    experience,
    input: Object.freeze(Object.fromEntries(
      Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    )),
    data,
  });
}
