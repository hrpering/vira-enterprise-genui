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
const JSON_STRINGIFY = JSON.stringify;
const NUMBER_CONVERT = Number;
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
const OBJECT_SET_PROTOTYPE_OF = Object.setPrototypeOf;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REGEXP_EXEC = RegExp.prototype.exec;
const STRING_CONVERT = String;
const STRING_INDEX_OF = String.prototype.indexOf;
const STRING_SLICE = String.prototype.slice;
const STRING_TRIM = String.prototype.trim;

function propertyKey(index: number): string {
  return REFLECT_APPLY(STRING_CONVERT, undefined, [index]) as string;
}

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

export function ownArrayLength(value: readonly unknown[]): number | undefined {
  const descriptor = ownData(value, "length");
  return descriptor
    && typeof descriptor.value === "number"
    && NUMBER_IS_SAFE_INTEGER(descriptor.value)
    && descriptor.value >= 0
    ? descriptor.value
    : undefined;
}

export function ownArrayValue<T>(value: readonly T[], index: number): T | undefined {
  const descriptor = ownData(value, propertyKey(index));
  return descriptor ? descriptor.value as T : undefined;
}

export function hasOwnField(value: object, key: PropertyKey): boolean {
  return OBJECT_HAS_OWN(value, key);
}

export function safeInteger(value: unknown): value is number {
  return typeof value === "number" && NUMBER_IS_SAFE_INTEGER(value);
}

export function matches(pattern: RegExp, value: string): boolean {
  return REFLECT_APPLY(REGEXP_EXEC, pattern, [value]) !== null;
}

export function containsOwnString(values: readonly string[], expected: string): boolean {
  const length = ownArrayLength(values);
  if (length === undefined) return false;
  for (let index = 0; index < length; index += 1) {
    const value = ownArrayValue(values, index);
    if (value === expected) return true;
  }
  return false;
}

function trimString(value: string): string {
  return REFLECT_APPLY(STRING_TRIM, value, []) as string;
}

export function packNamespace(value: string): string {
  const slash = REFLECT_APPLY(STRING_INDEX_OF, value, ["/"]) as number;
  return slash < 0 ? value : REFLECT_APPLY(STRING_SLICE, value, [0, slash]) as string;
}

export function canonicalJsonStringify(value: unknown): string {
  return REFLECT_APPLY(JSON_STRINGIFY, undefined, [value]) as string;
}

function sortedOwnStringKeys(value: Record<string, unknown>): readonly string[] | undefined {
  const source = OBJECT_KEYS(value);
  const length = ownArrayLength(source);
  if (length === undefined) return undefined;
  const result: string[] = [];

  for (let index = 0; index < length; index += 1) {
    const key = ownArrayValue(source, index);
    if (typeof key !== "string") return undefined;
    let insertAt = 0;
    while (insertAt < result.length) {
      const current = ownArrayValue(result, insertAt);
      if (current === undefined) return undefined;
      if (key < current) break;
      insertAt += 1;
    }
    for (let move = result.length; move > insertAt; move -= 1) {
      const previous = ownArrayValue(result, move - 1);
      if (previous === undefined) return undefined;
      defineOwnData(result, propertyKey(move), previous);
    }
    defineOwnData(result, propertyKey(insertAt), key);
  }
  return result;
}

export function record(value: unknown): UnknownRecord | undefined {
  try {
    if (value === null || typeof value !== "object" || ARRAY_IS_ARRAY(value)) return undefined;
    const prototype = OBJECT_GET_PROTOTYPE_OF(value);
    if (prototype !== OBJECT_PROTOTYPE && prototype !== null) return undefined;

    const keys = REFLECT_OWN_KEYS(value);
    const keyCount = ownArrayLength(keys);
    if (keyCount === undefined) return undefined;

    const result = OBJECT_CREATE(null) as UnknownRecord;
    for (let index = 0; index < keyCount; index += 1) {
      const key = ownArrayValue<PropertyKey>(keys, index);
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

    const length = ownArrayLength(value);
    if (length === undefined) return { ok: false, reason: "invalid" };
    if (length > maxLength) return { ok: false, reason: "limit-exceeded" };

    const result = new ARRAY_CONSTRUCTOR<unknown>(length);
    for (let index = 0; index < length; index += 1) {
      const key = propertyKey(index);
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
  const length = ownArrayLength(array);
  if (length === undefined) throw new Error("canonical array must have an own integer length");
  defineOwnData(array, propertyKey(length), value);
}

function allowedField(allowed: readonly string[], expected: string): boolean {
  const length = ownArrayLength(allowed);
  if (length === undefined) return false;
  for (let index = 0; index < length; index += 1) {
    if (ownArrayValue(allowed, index) === expected) return true;
  }
  return false;
}

export function exact(value: UnknownRecord, allowed: readonly string[]): string | undefined {
  const keys = OBJECT_KEYS(value);
  const length = ownArrayLength(keys);
  if (length === undefined) return undefined;
  let unknown: string | undefined;
  for (let index = 0; index < length; index += 1) {
    const key = ownArrayValue(keys, index);
    if (typeof key !== "string") continue;
    if (!allowedField(allowed, key) && (unknown === undefined || key < unknown)) unknown = key;
  }
  return unknown;
}

export function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value === trimString(value);
}

export function releaseVersion(value: unknown): readonly [number, number, number] | undefined {
  if (typeof value !== "string") return undefined;
  const match = REFLECT_APPLY(REGEXP_EXEC, RELEASE_VERSION, [value]) as RegExpExecArray | null;
  if (!match) return undefined;
  const majorText = ownArrayValue(match, 1);
  const minorText = ownArrayValue(match, 2);
  const patchText = ownArrayValue(match, 3);
  if (typeof majorText !== "string" || typeof minorText !== "string" || typeof patchText !== "string") {
    return undefined;
  }
  const major = REFLECT_APPLY(NUMBER_CONVERT, undefined, [majorText]) as number;
  const minor = REFLECT_APPLY(NUMBER_CONVERT, undefined, [minorText]) as number;
  const patch = REFLECT_APPLY(NUMBER_CONVERT, undefined, [patchText]) as number;
  if (
    !NUMBER_IS_SAFE_INTEGER(major) || major < 0 || major > 999_999_999
    || !NUMBER_IS_SAFE_INTEGER(minor) || minor < 0 || minor > 999_999_999
    || !NUMBER_IS_SAFE_INTEGER(patch) || patch < 0 || patch > 999_999_999
  ) return undefined;
  return [major, minor, patch] as const;
}

export function compareVersion(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const leftValue = ownArrayValue(left, index);
    const rightValue = ownArrayValue(right, index);
    const l = typeof leftValue === "number" ? leftValue : 0;
    const r = typeof rightValue === "number" ? rightValue : 0;
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
    const length = ownArrayLength(array);
    if (length !== undefined) {
      for (let index = 0; index < length; index += 1) {
        const descriptor = ownData(array, propertyKey(index));
        if (descriptor) freeze(descriptor.value);
      }
    }
    return OBJECT_FREEZE(value);
  }
  const object = value as Record<string, unknown>;
  const keys = OBJECT_KEYS(object);
  const length = ownArrayLength(keys);
  if (length !== undefined) {
    for (let index = 0; index < length; index += 1) {
      const key = ownArrayValue(keys, index);
      if (typeof key !== "string") continue;
      const descriptor = ownData(object, key);
      if (descriptor) freeze(descriptor.value);
    }
  }
  return OBJECT_FREEZE(value);
}

export function stable(value: unknown): unknown {
  if (ARRAY_IS_ARRAY(value)) {
    const length = ownArrayLength(value);
    if (length === undefined) return value;
    const result = new ARRAY_CONSTRUCTOR<unknown>(length);
    OBJECT_SET_PROTOTYPE_OF(result, null);
    for (let index = 0; index < length; index += 1) {
      const key = propertyKey(index);
      const descriptor = ownData(value, key);
      if (!descriptor) return value;
      defineOwnData(result, key, stable(descriptor.value));
    }
    return result;
  }
  const object = record(value);
  if (!object) return value;
  const result = OBJECT_CREATE(null) as Record<string, unknown>;
  const keys = sortedOwnStringKeys(object);
  if (!keys) return value;
  const length = ownArrayLength(keys);
  if (length === undefined) return value;
  for (let index = 0; index < length; index += 1) {
    const key = ownArrayValue(keys, index);
    if (typeof key !== "string") return value;
    const descriptor = ownData(object, key);
    if (!descriptor) return value;
    defineOwnData(result, key, stable(descriptor.value));
  }
  return result;
}
