import {
  EXPERIENCE_REGISTRY_MAX_ARRAY_LENGTH,
  EXPERIENCE_REGISTRY_MAX_DEPTH,
  EXPERIENCE_REGISTRY_MAX_NODES,
} from "./types.js";

const ARRAY_INDEX = /^(0|[1-9]\d*)$/;

export interface PlainDataBudget {
  nodes: number;
}

function primitive(value: unknown): boolean {
  return value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean";
}

function inspectArray(
  value: readonly unknown[],
  budget: PlainDataBudget,
  depth: number,
): boolean {
  if (value.length > EXPERIENCE_REGISTRY_MAX_ARRAY_LENGTH) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;

  const names = Object.getOwnPropertyNames(value);
  for (const name of names) {
    if (name === "length") continue;
    if (!ARRAY_INDEX.test(name) || Number(name) >= value.length) return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) return false;
    if (!preflightPlainData(descriptor.value, budget, depth + 1)) return false;
  }
  return true;
}

function inspectObject(
  value: object,
  budget: PlainDataBudget,
  depth: number,
): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;

  const names = Object.getOwnPropertyNames(value);
  if (names.length > EXPERIENCE_REGISTRY_MAX_ARRAY_LENGTH) return false;
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !("value" in descriptor)) return false;
    if (!preflightPlainData(descriptor.value, budget, depth + 1)) return false;
  }
  return true;
}

export function preflightPlainData(
  value: unknown,
  budget: PlainDataBudget,
  depth = 0,
): boolean {
  budget.nodes += 1;
  if (budget.nodes > EXPERIENCE_REGISTRY_MAX_NODES) return false;
  if (depth > EXPERIENCE_REGISTRY_MAX_DEPTH) return false;
  if (primitive(value)) return true;
  if (Array.isArray(value)) return inspectArray(value, budget, depth);
  if (typeof value !== "object" || value === null) return false;
  return inspectObject(value, budget, depth);
}
