import {
  parseViraHostedCapabilityBinding,
} from "./runtime.js";
import type {
  ViraHostedCapabilityBinding,
  ViraHostedCapabilityRuntimeIssue,
} from "./types.js";

export type ViraHostedCapabilityBindingSerializationResult =
  | {
      readonly ok: true;
      readonly value: string;
      readonly binding: ViraHostedCapabilityBinding;
    }
  | {
      readonly ok: false;
      readonly issue: ViraHostedCapabilityRuntimeIssue;
    };

export function serializeViraHostedCapabilityBinding(
  input: unknown,
): ViraHostedCapabilityBindingSerializationResult {
  const parsed = parseViraHostedCapabilityBinding(input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: JSON.stringify(parsed.value),
    binding: parsed.value,
  };
}
