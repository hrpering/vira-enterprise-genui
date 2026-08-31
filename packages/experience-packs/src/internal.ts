import { EXPERIENCE_PACK_ALLOWED_MEDIA_TYPES } from "./types.js";
import type { ExperiencePackArtifactRole } from "./types.js";

export type UnknownRecord = Record<string, unknown>;

export const SEGMENT = /^[a-z0-9](?:[a-z0-9._-]{0,62})$/;
export const PACK_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62})\/[a-z0-9](?:[a-z0-9._-]{0,62})$/;
export const ARTIFACT_ID = /^[a-z][a-z0-9._-]{0,127}$/;
export const TAG = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/;
export const SHA256 = /^sha256:[0-9a-f]{64}$/;
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function record(value: unknown): UnknownRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as UnknownRecord : undefined;
}

export function exact(value: UnknownRecord, allowed: readonly string[]): string | undefined {
  const allowedFields = new Set(allowed);
  return Object.keys(value).sort().find((key) => !allowedFields.has(key));
}

export function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value === value.trim();
}

export function releaseVersion(value: unknown): readonly [number, number, number] | undefined {
  if (typeof value !== "string" || !RELEASE_VERSION.test(value)) return undefined;
  const parts = value.split(".");
  if (parts.length !== 3) return undefined;
  const version = [Number(parts[0]), Number(parts[1]), Number(parts[2])] as const;
  return version.every((part) => Number.isSafeInteger(part) && part >= 0 && part <= 999_999_999)
    ? version
    : undefined;
}

export function compareVersion(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}

export function artifactRole(value: unknown): value is ExperiencePackArtifactRole {
  return typeof value === "string" && Object.hasOwn(EXPERIENCE_PACK_ALLOWED_MEDIA_TYPES, value);
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

export function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stable(item));
  const object = record(value);
  if (!object) return value;
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(object).sort()) result[key] = stable(object[key]);
  return result;
}
