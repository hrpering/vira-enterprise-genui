import type {
  ViraCapabilityDefinition,
} from "@vira-enterprise-genui/capability-contract";
import type {
  ViraHostedCapabilityBinding,
} from "@vira-enterprise-genui/hosted-capability-runtime";

export const VIRA_CAPABILITY_SUPPLY_SCHEMA_VERSION = "1" as const;
export const VIRA_CAPABILITY_SUPPLY_MAX_SOURCES = 64 as const;
export const VIRA_CAPABILITY_SUPPLY_MAX_SUPPLIES_PER_SOURCE = 512 as const;
export const VIRA_CAPABILITY_SUPPLY_MAX_TOTAL_SUPPLIES = 2_048 as const;

export interface ViraCapabilitySupplyRecord {
  readonly capability: ViraCapabilityDefinition;
  readonly binding: ViraHostedCapabilityBinding;
}

export interface ViraCapabilitySupplySource {
  readonly sourceId: string;
  readonly supplies: readonly ViraCapabilitySupplyRecord[];
}

export interface ViraCapabilitySupplySnapshot {
  readonly schemaVersion: typeof VIRA_CAPABILITY_SUPPLY_SCHEMA_VERSION;
  readonly sources: readonly ViraCapabilitySupplySource[];
}

export interface ViraCapabilitySupplyQuery {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly providerId: string | null;
  readonly locationId: string | null;
}

export interface ViraResolvedCapabilitySupply {
  readonly capability: ViraCapabilityDefinition;
  readonly binding: ViraHostedCapabilityBinding;
  readonly sourceIds: readonly string[];
}

export interface ViraCapabilitySupplyLookup {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly providerId: string | null;
  readonly locationId: string | null;
  readonly supplies: readonly ViraResolvedCapabilitySupply[];
}

export type ViraCapabilitySupplyIssueCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_SOURCE"
  | "SOURCE_LIMIT_EXCEEDED"
  | "SUPPLY_LIMIT_EXCEEDED"
  | "INVALID_SUPPLY"
  | "INVALID_CAPABILITY"
  | "INVALID_BINDING"
  | "CAPABILITY_MISMATCH"
  | "ACTION_BOUNDARY_REQUIRED"
  | "DUPLICATE_SOURCE"
  | "DUPLICATE_SUPPLY"
  | "CAPABILITY_CONFLICT"
  | "BINDING_CONFLICT"
  | "INVALID_QUERY";

export interface ViraCapabilitySupplyIssue {
  readonly code: ViraCapabilitySupplyIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCapabilitySupplySnapshotResult =
  | { readonly ok: true; readonly value: ViraCapabilitySupplySnapshot }
  | { readonly ok: false; readonly issue: ViraCapabilitySupplyIssue };

export type ViraCapabilitySupplySerializationResult =
  | {
      readonly ok: true;
      readonly value: string;
      readonly snapshot: ViraCapabilitySupplySnapshot;
    }
  | { readonly ok: false; readonly issue: ViraCapabilitySupplyIssue };

export type ViraCapabilitySupplyLookupResult =
  | { readonly ok: true; readonly value: ViraCapabilitySupplyLookup }
  | { readonly ok: false; readonly issue: ViraCapabilitySupplyIssue };
