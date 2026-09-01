import type { StudioDesignCatalogOptions } from "@vira-enterprise-genui/studio-design";

export const DESIGN_SYSTEM_COMPILER_SOURCE_FORMAT = "dtcg-2025.10" as const;
export const DESIGN_SYSTEM_COMPILER_MAX_DEPTH = 32 as const;
export const DESIGN_SYSTEM_COMPILER_MAX_NODES = 8_192 as const;
export const DESIGN_SYSTEM_COMPILER_MAX_TOKENS = 4_096 as const;
export const DESIGN_SYSTEM_COMPILER_MAX_METADATA_LENGTH = 2_000 as const;

export type DesignSystemCompileCode =
  | "INVALID_ROOT"
  | "INVALID_GROUP"
  | "INVALID_TOKEN"
  | "UNKNOWN_RESERVED_FIELD"
  | "MISSING_TYPE"
  | "UNSUPPORTED_REFERENCE"
  | "UNSUPPORTED_EXTENDS"
  | "INVALID_COLOR"
  | "UNSUPPORTED_COLOR_SPACE"
  | "INVALID_FONT_FAMILY"
  | "PALETTE_LIMIT_EXCEEDED"
  | "FONT_LIMIT_EXCEEDED"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "NO_SUPPORTED_TOKENS"
  | "UNSAFE_NAME";

export interface DesignSystemCompileIssue {
  readonly code: DesignSystemCompileCode;
  readonly path: string;
  readonly message: string;
}

export interface DesignSystemCompileMetadata {
  readonly sourceFormat: typeof DESIGN_SYSTEM_COMPILER_SOURCE_FORMAT;
  readonly visitedTokenCount: number;
  readonly compiledTokenCount: number;
  readonly ignoredTokenCount: number;
  readonly colorTokenPaths: readonly string[];
  readonly fontTokenPaths: readonly string[];
}

export interface CompiledStudioDesignSystem {
  readonly options: StudioDesignCatalogOptions;
  readonly metadata: DesignSystemCompileMetadata;
}

export type DesignSystemCompileResult =
  | { readonly ok: true; readonly value: CompiledStudioDesignSystem }
  | { readonly ok: false; readonly issue: DesignSystemCompileIssue };
