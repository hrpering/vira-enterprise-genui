import { EXPERIENCE_PACK_ALLOWED_MEDIA_TYPES } from "./types.js";
import type { ExperiencePackArtifactRole } from "./types.js";

export type UnknownRecord = Record<string, unknown>;
export type DenseOwnDataArrayResult =
  | { readonly ok: true; readonly value: readonly unknown[] }
  | { readonly ok: false; readonly reason: "invalid" | "limit-exceeded" };

export const SEGMENT = /^[a-z0-9](?:[a-z0-9._-]{0,62})$/;
export const PACK_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62})\/[a-z0-9](?:[a-z0-9._-]{0,62})$/;
export const ARTIFACT_ID = /^[a-z][a-z0-9._-]{0,127}$/;
export const TAG = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/;
export const SHA256 = /^sha256:[0-9a-f]{64}$/;
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function ownData(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && "value" in descriptor ? descriptor : undefined;
}

function defineOwnData(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

export function record(value: unknown): UnknownRecord | undefined {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;

    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol")) return undefined;

    const result = Object.create(null) as UnknownRecord;
    for (const key of keys) {
      if (typeof key !== "string") return undefined;
      const descriptor = ownData(value, key);
      if (!descriptor) return undefined;
      defineOwnData(result, key, descriptor.value);
    }
    return result;
  } catch {
    return undefined;
  }
}

export function denseOwnDataArray(
  value: unknown,
  maxLength: number,
): DenseOwnDataArrayResult {
  try {
    if (!Array.isArray(value)) return { ok: false, reason: "invalid" };
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Array.prototype && prototype !== null) {
      return { ok: false, reason: "invalid" };
    }

    const lengthDescriptor = ownData(value, "length");
    if (
      !lengthDescriptor
      || typeof lengthDescriptor.value !== "number"
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
    ) return { ok: false, reason: "invalid" };
    const length = lengthDescriptor.value;
    if (length > maxLength) return { ok: false, reason: "limit-exceeded" };

    const result = new Array<unknown>(length);
    for (let index = 0; index < length; index += 1) {
      const descriptor = ownData(value, String(index));
      if (!descriptor) return { ok: false, reason: "invalid" };
      defineOwnData(result, String(index), descriptor.value);
    }
    return { ok: true, value: result };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function appendOwnArrayValue<T>(array: T[], value: T): void {
  defineOwnData(array, String(array.length), value);
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
