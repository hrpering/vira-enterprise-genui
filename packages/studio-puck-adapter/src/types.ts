import type { Data } from "@puckeditor/core";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";

export const STUDIO_PUCK_ADAPTER_VERSION = "1" as const;
export const STUDIO_PUCK_ID_MAX_LENGTH = 256 as const;

export type StudioPuckField =
  | { readonly type: "text"; readonly label: string }
  | { readonly type: "color"; readonly label: string }
  | { readonly type: "number"; readonly label: string; readonly min?: number; readonly max?: number; readonly step?: number }
  | {
      readonly type: "radio";
      readonly label: string;
      readonly options: readonly [
        { readonly label: "True"; readonly value: true },
        { readonly label: "False"; readonly value: false },
      ];
    }
  | {
      readonly type: "select";
      readonly label: string;
      readonly options: readonly { readonly label: string; readonly value: string }[];
    }
  | { readonly type: "slot"; readonly label: string };

export interface StudioPuckComponentEditorDefinition {
  readonly type: string;
  readonly label: string;
  readonly category: string;
  readonly fields: Readonly<Record<string, StudioPuckField>>;
  /** Deterministic safe bootstrap values for required props when Puck inserts a new block. */
  readonly defaultProps: Readonly<Record<string, string | number | boolean>>;
}

export interface StudioPuckCategoryDefinition {
  readonly title: string;
  readonly components: readonly string[];
}

export interface StudioPuckEditorMetadata {
  readonly version: typeof STUDIO_PUCK_ADAPTER_VERSION;
  readonly catalogId: string;
  readonly brandId: string;
  readonly components: readonly StudioPuckComponentEditorDefinition[];
  readonly categories: Readonly<Record<string, StudioPuckCategoryDefinition>>;
}

export interface StudioPuckIdMapping {
  readonly puckId: string;
  readonly nodeId: string;
}

export type StudioPuckAdapterValidationCode =
  | "INVALID_CATALOG"
  | "PUCK_FIELD_COLLISION"
  | "INVALID_DOCUMENT"
  | "VIEW_NOT_FOUND"
  | "INVALID_PUCK_DATA"
  | "UNSUPPORTED_ROOT_DATA"
  | "LEGACY_ZONES_UNSUPPORTED"
  | "NODE_LIMIT_EXCEEDED"
  | "UNREGISTERED_COMPONENT"
  | "INVALID_COMPONENT_DATA"
  | "INVALID_PUCK_PROP"
  | "INVALID_ID_MAPPINGS"
  | "DUPLICATE_ID_MAPPING"
  | "NODE_ID_MAPPING_REQUIRED"
  | "DUPLICATE_NODE_ID"
  | "UNUSED_ID_MAPPING"
  | "INVALID_IMPORTED_DOCUMENT";

export interface StudioPuckAdapterValidationIssue {
  readonly code: StudioPuckAdapterValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioPuckEditorMetadataResult =
  | { readonly ok: true; readonly value: StudioPuckEditorMetadata }
  | { readonly ok: false; readonly issue: StudioPuckAdapterValidationIssue };

export type StudioPuckDataExportResult =
  | { readonly ok: true; readonly value: Data }
  | { readonly ok: false; readonly issue: StudioPuckAdapterValidationIssue };

export type StudioPuckDataImportResult =
  | { readonly ok: true; readonly value: StudioExperienceDocument }
  | { readonly ok: false; readonly issue: StudioPuckAdapterValidationIssue };
