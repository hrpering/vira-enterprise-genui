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
const ARRAY_CONSTRUCTOR = Array;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS_FROZEN = Object.isFrozen;
const OBJECT_KEYS = Object.keys;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const STRING_CONVERT = String;

function ownData(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(object, key);
  return descriptor && OBJECT_HAS_OWN(descriptor, "value") ? descriptor : undefined;
}

function defineOwnData(target: object, key: PropertyKey, value: unknown): void {
  OBJECT_DEFINE_PROPERTY(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

export function record(value: unknown): UnknownRecord | undefined {
  try {
    if (value === null || typeof value !== "object" || ARRAY_IS_ARRAY(value)) return undefined;
    const prototype = OBJECT_GET_PROTOTYPE_OF(value);
    if (prototype !== OBJECT_PROTOTYPE && prototype !== null) return undefined;

    const keys = REFLECT_OWN_KEYS(value);
    if (keys.some((key) => typeof key === "symbol")) return undefined;

    const result = OBJECT_CREATE(null) as UnknownRecord;
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
    if (!ARRAY_IS_ARRAY(value)) return { ok: false, reason: "invalid" };
    const prototype = OBJECT_GET_PROTOTYPE_OF(value);
    if (prototype !== ARRAY_PROTOTYPE && prototype !== null) {
      return { ok: false, reason: "invalid" };
    }

    const lengthDescriptor = ownData(value, "length");
    if (
      !lengthDescriptor
      || typeof lengthDescriptor.value !== "number"
      || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value)
      || lengthDescriptor.value < 0
    ) return { ok: false, reason: "invalid" };
    const length = lengthDescriptor.value;
    if (length > maxLength) return { ok: false, reason: "limit-exceeded" };

    const result = new ARRAY_CONSTRUCTOR<unknown>(length);
    for (let index = 0; index < length; index += 1) {
      const key = STRING_CONVERT(index);
      const descriptor = ownData(value, key);
      if (!descriptor) return { ok: false, reason: "invalid" };
      defineOwnData(result, key, descriptor.value);
    }
    return { ok: true, value: result };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function appendOwnArrayValue<T>(array: T[], value: T): void {
  defineOwnData(array, STRING_CONVERT(array.length), value);
}

export function exact(value: UnknownRecord, allowed: readonly string[]): string | undefined {
  const allowedFields = new Set(allowed);
  return OBJECT_KEYS(value).sort().find((key) => !allowedFields.has(key));
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
  return version.every((part) => NUMBER_IS_SAFE_INTEGER(part) && part >= 0 && part <= 999_999_999)
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
  return typeof value === "string" && OBJECT_HAS_OWN(EXPERIENCE_PACK_ALLOWED_MEDIA_TYPES, value);
}

export function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || OBJECT_IS_FROZEN(value)) return value;
  if (ARRAY_IS_ARRAY(value)) {
    const array = value as unknown[];
    for (let index = 0; index < array.length; index += 1) {
      const descriptor = ownData(array, index);
      if (descriptor) freeze(descriptor.value);
    }
    return OBJECT_FREEZE(value);
  }
  const object = value as Record<string, unknown>;
  const keys = OBJECT_KEYS(object);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) continue;
    const descriptor = ownData(object, key);
    if (descriptor) freeze(descriptor.value);
  }
  return OBJECT_FREEZE(value);
}

export function stable(value: unknown): unknown {
  if (ARRAY_IS_ARRAY(value)) {
    const lengthDescriptor = ownData(value, "length");
    if (
      !lengthDescriptor
      || typeof lengthDescriptor.value !== "number"
      || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value)
      || lengthDescriptor.value < 0
    ) return value;
    const result = new ARRAY_CONSTRUCTOR<unknown>(lengthDescriptor.value);
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const key = STRING_CONVERT(index);
      const descriptor = ownData(value, key);
      if (!descriptor) return value;
      defineOwnData(result, key, stable(descriptor.value));
    }
    return result;
  }
  const object = record(value);
  if (!object) return value;
  const result: Record<string, unknown> = OBJECT_CREATE(null) as Record<string, unknown>;
  for (const key of OBJECT_KEYS(object).sort()) result[key] = stable(object[key]);
  return result;
}
