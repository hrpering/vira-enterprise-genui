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
const GROUP_METADATA_FIELDS = new Set(["$type", "$description", "$deprecated"]);
const SAFE_FONT_FAMILY_PART = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;
const CSS_WIDE_FONT_KEYWORDS = new Set(["inherit", "initial", "revert", "revert-layer", "unset"]);
const MAX_FONT_FALLBACKS = 8;
const MAX_TOKEN_PROPERTIES = 16;

type NodeKind = "group" | "token";

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

interface GroupChild {
  readonly key: string;
  readonly path: string;
  readonly value: Record<string, unknown>;
  readonly isToken: boolean;
}

type BoundedKeysResult =
  | { readonly ok: true; readonly value: readonly string[] }
  | { readonly ok: false; readonly issue: DesignSystemCompileIssue };

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

function boundedSortedKeys(
  node: Record<string, unknown>,
  path: string,
  maxProperties: number,
): BoundedKeysResult {
  const keys: string[] = [];
  for (const key in node) {
    if (!Object.hasOwn(node, key)) continue;
    if (keys.length >= maxProperties) {
      return {
        ok: false,
        issue: issue(
          "RESOURCE_LIMIT_EXCEEDED",
          path,
          `DTCG node exceeds the bounded property budget of ${maxProperties}`,
        ),
      };
    }
    keys.push(key);
  }
  keys.sort();
  return { ok: true, value: keys };
}

function validateMetadata(
  node: Record<string, unknown>,
  path: string,
  allowed: ReadonlySet<string>,
  kind: NodeKind,
  keys: readonly string[],
): DesignSystemCompileIssue | undefined {
  if (Object.hasOwn(node, "$extends")) {
    return issue("UNSUPPORTED_EXTENDS", `${path}.$extends`, "DTCG $extends resolution is outside compiler v1");
  }
  if (Object.hasOwn(node, "$ref")) {
    return issue("UNSUPPORTED_REFERENCE", `${path}.$ref`, "DTCG JSON Pointer references are outside compiler v1");
  }
  const unknown = keys.find((key) => key.startsWith("$") && !allowed.has(key));
  if (unknown) {
    return issue("UNKNOWN_RESERVED_FIELD", childPath(path, unknown), `unsupported DTCG reserved field: ${unknown}`);
  }
  const invalidCode = kind === "token" ? "INVALID_TOKEN" : "INVALID_GROUP";
  if (Object.hasOwn(node, "$type") && !validTypeName(node.$type)) {
    return issue(invalidCode, `${path}.$type`, "$type must be a bounded non-empty string");
  }
  if (Object.hasOwn(node, "$description") && !validMetadataText(node.$description, DESIGN_SYSTEM_COMPILER_MAX_METADATA_LENGTH)) {
    return issue(invalidCode, `${path}.$description`, "$description must be bounded plain text");
  }
  if (Object.hasOwn(node, "$deprecated")) {
    const deprecated = node.$deprecated;
    if (typeof deprecated !== "boolean" && !validMetadataText(deprecated, DESIGN_SYSTEM_COMPILER_MAX_METADATA_LENGTH)) {
      return issue(invalidCode, `${path}.$deprecated`, "$deprecated must be boolean or bounded plain text");
    }
  }
  return undefined;
}

function validUnquotedFontFamily(value: string): boolean {
  if (value.length === 0 || value.length > 64 || CSS_WIDE_FONT_KEYWORDS.has(value.toLowerCase())) return false;
  const parts = value.split(" ");
  return parts.length > 0 && parts.every((part) => SAFE_FONT_FAMILY_PART.test(part));
}

function validateFontName(value: unknown, path: string):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly issue: DesignSystemCompileIssue } {
  if (curlyReference(value) || objectReference(value)) {
    return { ok: false, issue: issue("UNSUPPORTED_REFERENCE", path, "font family references are not resolved by compiler v1") };
  }
  if (typeof value !== "string" || value !== value.trim() || !validUnquotedFontFamily(value)) {
    return {
      ok: false,
      issue: issue(
        "INVALID_FONT_FAMILY",
        path,
        "font family names must be safe unquoted CSS family identifiers and must not use CSS-wide keywords",
      ),
    };
  }
  return { ok: true, value };
}

function compileFontFamily(value: unknown, path: string):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly issue: DesignSystemCompileIssue } {
  if (curlyReference(value) || objectReference(value)) {
    return { ok: false, issue: issue("UNSUPPORTED_REFERENCE", path, "DTCG token references are not resolved by compiler v1") };
  }

  if (typeof value === "string") {
    return validateFontName(value, path);
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FONT_FALLBACKS) {
    return { ok: false, issue: issue("INVALID_FONT_FAMILY", path, `fontFamily must be a string or an array of 1 to ${MAX_FONT_FALLBACKS} strings`) };
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = validateFontName(value[index], `${path}[${index}]`);
    if (!parsed.ok) return parsed;
    if (seen.has(parsed.value)) {
      return { ok: false, issue: issue("INVALID_FONT_FAMILY", `${path}[${index}]`, "font family fallback entries must be unique") };
    }
    seen.add(parsed.value);
    normalized.push(parsed.value);
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

  const keyResult = boundedSortedKeys(token, path, MAX_TOKEN_PROPERTIES);
  if (!keyResult.ok) return keyResult.issue;
  const metadataIssue = validateMetadata(token, path, TOKEN_RESERVED_FIELDS, "token", keyResult.value);
  if (metadataIssue) return metadataIssue;
  const nonReserved = keyResult.value.find((key) => !key.startsWith("$"));
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

function visitGroupChild(
  child: GroupChild,
  groupType: string | undefined,
  depth: number,
  state: CompileState,
): DesignSystemCompileIssue | undefined {
  return child.isToken
    ? visitToken(child.value, child.path, groupType, state)
    : visitGroup(child.value, child.path, groupType, depth + 1, state);
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

  const remainingNodeCapacity = DESIGN_SYSTEM_COMPILER_MAX_NODES - state.visitedNodeCount;
  const keyResult = boundedSortedKeys(group, path, remainingNodeCapacity + GROUP_METADATA_FIELDS.size);
  if (!keyResult.ok) return keyResult.issue;
  const metadataIssue = validateMetadata(group, path, GROUP_RESERVED_FIELDS, "group", keyResult.value);
  if (metadataIssue) return metadataIssue;
  const groupType = Object.hasOwn(group, "$type") ? group.$type as string : inheritedType;

  const children: GroupChild[] = [];
  for (const key of keyResult.value) {
    if (GROUP_METADATA_FIELDS.has(key)) continue;
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
    children.push({ key, path: nextPath, value: child, isToken });
  }

  if (state.visitedNodeCount + children.length > DESIGN_SYSTEM_COMPILER_MAX_NODES) {
    return issue(
      "RESOURCE_LIMIT_EXCEEDED",
      path,
      `DTCG source may contain at most ${DESIGN_SYSTEM_COMPILER_MAX_NODES} groups and tokens`,
    );
  }

  // DTCG 2025.10 group processing order: local tokens, root token,
  // extended tokens, nested groups. `$extends` is unsupported in compiler v1,
  // so the supported order is local tokens -> `$root` -> nested groups.
  for (const child of children.filter((candidate) => candidate.key !== "$root" && candidate.isToken)) {
    const childIssue = visitGroupChild(child, groupType, depth, state);
    if (childIssue) return childIssue;
  }
  const rootToken = children.find((candidate) => candidate.key === "$root");
  if (rootToken) {
    const childIssue = visitGroupChild(rootToken, groupType, depth, state);
    if (childIssue) return childIssue;
  }
  for (const child of children.filter((candidate) => !candidate.isToken)) {
    const childIssue = visitGroupChild(child, groupType, depth, state);
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
