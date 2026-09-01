import type { DesignSystemCompileIssue } from "./types.js";

export type UnknownRecord = Record<string, unknown>;

const SAFE_PATH_SEGMENT = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const BLOCKED_NAMES = new Set(["__proto__", "prototype", "constructor"]);
const CURLY_REFERENCE = /^\{[^{}]+\}$/;

function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1F || code === 0x7F) return true;
  }
  return false;
}

export function record(value: unknown): UnknownRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as UnknownRecord
    : undefined;
}

export function childPath(path: string, key: string): string {
  return SAFE_PATH_SEGMENT.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

export function safeName(value: string): boolean {
  return value.length > 0
    && value.length <= 128
    && value === value.trim()
    && !hasAsciiControlCharacter(value)
    && !BLOCKED_NAMES.has(value);
}

export function validTypeName(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 64
    && value === value.trim()
    && !hasAsciiControlCharacter(value);
}

export function validMetadataText(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length <= maxLength
    && !hasAsciiControlCharacter(value);
}

export function curlyReference(value: unknown): boolean {
  return typeof value === "string" && CURLY_REFERENCE.test(value);
}

export function objectReference(value: unknown): boolean {
  const object = record(value);
  return object !== undefined && Object.hasOwn(object, "$ref");
}

export function issue(
  code: DesignSystemCompileIssue["code"],
  path: string,
  message: string,
): DesignSystemCompileIssue {
  return { code, path, message };
}

export function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
    return Object.freeze(value);
  }
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) freeze(object[key]);
  return Object.freeze(value);
}
