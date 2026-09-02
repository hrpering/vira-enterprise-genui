import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DEMO_EXPERIENCE_REGISTRATIONS } from "./demo-experience-registry.js";

const packIdentitySchema = z.object({
  id: z.string().min(1).max(4_096),
  version: z.string().min(1).max(4_096),
  entrypoint: z.string().min(1).max(4_096),
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

function packKey(pack: { readonly id: string; readonly version: string; readonly entrypoint: string }): string {
  return `${pack.id}@${pack.version}:${pack.entrypoint}`;
}

const presenters = new Map(
  DEMO_EXPERIENCE_REGISTRATIONS.map((registration) => [packKey(registration.pack), registration] as const),
);

export const DEMO_EXPERIENCE_SYSTEM_INSTRUCTIONS = Object.freeze(
  DEMO_EXPERIENCE_REGISTRATIONS.flatMap((registration) => registration.instructions),
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

  const registration = presenters.get(packKey(input.pack));
  if (!registration) throw new Error("requested Vira Experience Pack is not registered");

  return Object.freeze({
    version: "1" as const,
    op: "present" as const,
    instanceId: `experience-${randomUUID()}`,
    pack: Object.freeze({ ...input.pack }),
    payload: registration.present(input.input),
  });
}
