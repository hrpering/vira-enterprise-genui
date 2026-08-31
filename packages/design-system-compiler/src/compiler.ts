import {
  STUDIO_DESIGN_MAX_FONTS,
  STUDIO_DESIGN_MAX_PALETTE_COLORS,
} from "@vira-enterprise-genui/studio-design";
import type { StudioDesignCatalogOptions } from "@vira-enterprise-genui/studio-design";
import { compileDtcgColor } from "./color.js";
import {
  childPath,
  curlyReference,
  freeze,
  issue,
  objectReference,
  record,
  safeName,
  validMetadataText,
  validTypeName,
} from "./internal.js";
import {
  DESIGN_SYSTEM_COMPILER_MAX_DEPTH,
  DESIGN_SYSTEM_COMPILER_MAX_METADATA_LENGTH,
  DESIGN_SYSTEM_COMPILER_MAX_NODES,
  DESIGN_SYSTEM_COMPILER_MAX_TOKENS,
  DESIGN_SYSTEM_COMPILER_SOURCE_FORMAT,
} from "./types.js";
import type {
  DesignSystemCompileIssue,
  DesignSystemCompileResult,
} from "./types.js";

const GROUP_RESERVED_FIELDS = new Set(["$type", "$description", "$deprecated", "$root"]);
const TOKEN_RESERVED_FIELDS = new Set(["$value", "$type", "$description", "$deprecated"]);
const SAFE_FONT_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/;
const MAX_FONT_FALLBACKS = 8;

interface CompileState {
  visitedNodeCount: number;
  visitedTokenCount: number;
  compiledTokenCount: number;
  ignoredTokenCount: number;
  readonly colors: string[];
  readonly colorSet: Set<string>;
  readonly fonts: string[];
  readonly fontSet: Set<string>;
  readonly colorTokenPaths: string[];
  readonly fontTokenPaths: string[];
}

function failure(issueValue: DesignSystemCompileIssue): DesignSystemCompileResult {
  return { ok: false, issue: issueValue };
}

function enterNode(state: CompileState, path: string, token: boolean): DesignSystemCompileIssue | undefined {
  state.visitedNodeCount += 1;
  if (state.visitedNodeCount > DESIGN_SYSTEM_COMPILER_MAX_NODES) {
    return issue("RESOURCE_LIMIT_EXCEEDED", path, `DTCG source may contain at most ${DESIGN_SYSTEM_COMPILER_MAX_NODES} groups and tokens`);
  }
  if (token) {
    state.visitedTokenCount += 1;
    if (state.visitedTokenCount > DESIGN_SYSTEM_COMPILER_MAX_TOKENS) {
      return issue("RESOURCE_LIMIT_EXCEEDED", path, `DTCG source may contain at most ${DESIGN_SYSTEM_COMPILER_MAX_TOKENS} tokens`);
    }
  }
  return undefined;
}

function validateMetadata(
  node: Record<string, unknown>,
  path: string,
  allowed: ReadonlySet<string>,
): DesignSystemCompileIssue | undefined {
  if (Object.hasOwn(node, "$extends")) {
    return issue("UNSUPPORTED_EXTENDS", `${path}.$extends`, "DTCG $extends resolution is outside compiler v1");
  }
  if (Object.hasOwn(node, "$ref")) {
    return issue("UNSUPPORTED_REFERENCE", `${path}.$ref`, "DTCG JSON Pointer references are outside compiler v1");
  }
  const unknown = Object.keys(node).sort().find((key) => key.startsWith("$") && !allowed.has(key));
  if (unknown) {
    return issue("UNKNOWN_RESERVED_FIELD", childPath(path, unknown), `unsupported DTCG reserved field: ${unknown}`);
  }
  if (Object.hasOwn(node, "$type") && !validTypeName(node.$type)) {
    return issue("INVALID_GROUP", `${path}.$type`, "$type must be a bounded non-empty string");
  }
  if (Object.hasOwn(node, "$description") && !validMetadataText(node.$description, DESIGN_SYSTEM_COMPILER_MAX_METADATA_LENGTH)) {
    return issue("INVALID_GROUP", `${path}.$description`, "$description must be bounded plain text");
  }
  if (Object.hasOwn(node, "$deprecated")) {
    const deprecated = node.$deprecated;
    if (typeof deprecated !== "boolean" && !validMetadataText(deprecated, DESIGN_SYSTEM_COMPILER_MAX_METADATA_LENGTH)) {
      return issue("INVALID_GROUP", `${path}.$deprecated`, "$deprecated must be boolean or bounded plain text");
    }
  }
  return undefined;
}

function compileFontFamily(value: unknown, path: string):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly issue: DesignSystemCompileIssue } {
  if (curlyReference(value) || objectReference(value)) {
    return { ok: false, issue: issue("UNSUPPORTED_REFERENCE", path, "DTCG token references are not resolved by compiler v1") };
  }

  const families = typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value
      : undefined;
  if (!families || families.length === 0 || families.length > MAX_FONT_FALLBACKS) {
    return { ok: false, issue: issue("INVALID_FONT_FAMILY", path, `fontFamily must be a string or an array of 1 to ${MAX_FONT_FALLBACKS} strings`) };
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < families.length; index += 1) {
    const family = families[index];
    if (typeof family !== "string" || family !== family.trim() || !SAFE_FONT_FAMILY.test(family)) {
      return { ok: false, issue: issue("INVALID_FONT_FAMILY", `${path}[${index}]`, "font family names must use the safe compiler v1 grammar") };
    }
    if (curlyReference(family)) {
      return { ok: false, issue: issue("UNSUPPORTED_REFERENCE", `${path}[${index}]`, "font family references are not resolved by compiler v1") };
    }
    if (seen.has(family)) {
      return { ok: false, issue: issue("INVALID_FONT_FAMILY", `${path}[${index}]`, "font family fallback entries must be unique") };
    }
    seen.add(family);
    normalized.push(family);
  }

  const stack = normalized.join(", ");
  if (stack.length > 128) {
    return { ok: false, issue: issue("INVALID_FONT_FAMILY", path, "compiled font family stack exceeds the Studio font limit") };
  }
  return { ok: true, value: stack };
}

function visitToken(
  token: Record<string, unknown>,
  path: string,
  inheritedType: string | undefined,
  state: CompileState,
): DesignSystemCompileIssue | undefined {
  const resourceIssue = enterNode(state, path, true);
  if (resourceIssue) return resourceIssue;

  const metadataIssue = validateMetadata(token, path, TOKEN_RESERVED_FIELDS);
  if (metadataIssue) return metadataIssue;
  const nonReserved = Object.keys(token).sort().find((key) => !key.startsWith("$"));
  if (nonReserved) {
    return issue("INVALID_TOKEN", childPath(path, nonReserved), "DTCG token objects may contain only reserved token properties");
  }
  if (!Object.hasOwn(token, "$value")) {
    return issue("INVALID_TOKEN", path, "DTCG token must contain $value");
  }

  const explicitType = Object.hasOwn(token, "$type") ? token.$type : undefined;
  const tokenType = explicitType === undefined ? inheritedType : explicitType as string;
  if (tokenType === undefined) {
    return issue("MISSING_TYPE", path, "token type must be explicit or inherited from a parent group");
  }

  if (tokenType === "color") {
    const compiled = compileDtcgColor(token.$value, `${path}.$value`);
    if (!compiled.ok) return compiled.issue;
    state.compiledTokenCount += 1;
    state.colorTokenPaths.push(path);
    if (!state.colorSet.has(compiled.value)) {
      if (state.colors.length >= STUDIO_DESIGN_MAX_PALETTE_COLORS) {
        return issue("PALETTE_LIMIT_EXCEEDED", path, `compiled palette may contain at most ${STUDIO_DESIGN_MAX_PALETTE_COLORS} unique colors`);
      }
      state.colorSet.add(compiled.value);
      state.colors.push(compiled.value);
    }
    return undefined;
  }

  if (tokenType === "fontFamily") {
    const compiled = compileFontFamily(token.$value, `${path}.$value`);
    if (!compiled.ok) return compiled.issue;
    state.compiledTokenCount += 1;
    state.fontTokenPaths.push(path);
    if (!state.fontSet.has(compiled.value)) {
      if (state.fonts.length >= STUDIO_DESIGN_MAX_FONTS) {
        return issue("FONT_LIMIT_EXCEEDED", path, `compiled font list may contain at most ${STUDIO_DESIGN_MAX_FONTS} unique entries`);
      }
      state.fontSet.add(compiled.value);
      state.fonts.push(compiled.value);
    }
    return undefined;
  }

  state.ignoredTokenCount += 1;
  return undefined;
}

function visitGroup(
  group: Record<string, unknown>,
  path: string,
  inheritedType: string | undefined,
  depth: number,
  state: CompileState,
): DesignSystemCompileIssue | undefined {
  if (depth > DESIGN_SYSTEM_COMPILER_MAX_DEPTH) {
    return issue("RESOURCE_LIMIT_EXCEEDED", path, `DTCG group depth may not exceed ${DESIGN_SYSTEM_COMPILER_MAX_DEPTH}`);
  }
  const resourceIssue = enterNode(state, path, false);
  if (resourceIssue) return resourceIssue;
  if (Object.hasOwn(group, "$value")) {
    return issue("INVALID_GROUP", path, "root and nested groups must not contain $value");
  }

  const metadataIssue = validateMetadata(group, path, GROUP_RESERVED_FIELDS);
  if (metadataIssue) return metadataIssue;
  const groupType = Object.hasOwn(group, "$type") ? group.$type as string : inheritedType;

  const metadataKeys = new Set(["$type", "$description", "$deprecated"]);
  for (const key of Object.keys(group).sort()) {
    if (metadataKeys.has(key)) continue;
    if (key.startsWith("$") && key !== "$root") {
      return issue("UNKNOWN_RESERVED_FIELD", childPath(path, key), `unsupported DTCG reserved field: ${key}`);
    }
    if (key !== "$root" && !safeName(key)) {
      return issue("UNSAFE_NAME", childPath(path, key), "token and group names must be bounded and must not use prototype-sensitive names");
    }

    const child = record(group[key]);
    const nextPath = childPath(path, key);
    if (!child) {
      return issue("INVALID_GROUP", nextPath, "group children must be DTCG group or token objects");
    }
    const isToken = Object.hasOwn(child, "$value");
    if (key === "$root" && !isToken) {
      return issue("INVALID_GROUP", nextPath, "$root must be a token");
    }
    const childIssue = isToken
      ? visitToken(child, nextPath, groupType, state)
      : visitGroup(child, nextPath, groupType, depth + 1, state);
    if (childIssue) return childIssue;
  }
  return undefined;
}

export function compileDtcgDesignTokens(input: unknown): DesignSystemCompileResult {
  const root = record(input);
  if (!root || Object.hasOwn(root, "$value")) {
    return failure(issue("INVALID_ROOT", "$", "DTCG source root must be a group object"));
  }

  const state: CompileState = {
    visitedNodeCount: 0,
    visitedTokenCount: 0,
    compiledTokenCount: 0,
    ignoredTokenCount: 0,
    colors: [],
    colorSet: new Set<string>(),
    fonts: [],
    fontSet: new Set<string>(),
    colorTokenPaths: [],
    fontTokenPaths: [],
  };
  const compileIssue = visitGroup(root, "$", undefined, 0, state);
  if (compileIssue) return failure(compileIssue);
  if (state.compiledTokenCount === 0) {
    return failure(issue("NO_SUPPORTED_TOKENS", "$", "source contains no supported literal color or fontFamily tokens"));
  }

  const options: StudioDesignCatalogOptions = {
    ...(state.colors.length > 0 ? { colorMode: "palette" as const, colors: [...state.colors] } : {}),
    ...(state.fonts.length > 0 ? { fonts: [...state.fonts] } : {}),
  };
  return {
    ok: true,
    value: freeze({
      options,
      metadata: {
        sourceFormat: DESIGN_SYSTEM_COMPILER_SOURCE_FORMAT,
        visitedTokenCount: state.visitedTokenCount,
        compiledTokenCount: state.compiledTokenCount,
        ignoredTokenCount: state.ignoredTokenCount,
        colorTokenPaths: [...state.colorTokenPaths],
        fontTokenPaths: [...state.fontTokenPaths],
      },
    }),
  };
}
