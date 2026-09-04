import type {
  ViraEnterpriseContext,
  ViraEnterpriseEnvironmentName,
  ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";

export const VIRA_PRIVATE_ENTERPRISE_REGISTRY_VERSION = "1" as const;
export const VIRA_PRIVATE_ENTERPRISE_REGISTRY_MAX_ENTRIES = 4_096 as const;
export const VIRA_PRIVATE_ENTERPRISE_REGISTRY_KINDS = [
  "experience",
  "component",
  "action",
  "policy",
  "connector",
  "theme",
  "pack",
] as const;

export type ViraPrivateEnterpriseRegistryKind = typeof VIRA_PRIVATE_ENTERPRISE_REGISTRY_KINDS[number];

export interface ViraPrivateEnterpriseRegistryEntry {
  readonly version: typeof VIRA_PRIVATE_ENTERPRISE_REGISTRY_VERSION;
  readonly kind: ViraPrivateEnterpriseRegistryKind;
  readonly id: string;
  readonly versionRef: string;
  readonly nativeCapabilityId?: string;
}

export interface ViraPrivateEnterpriseRegistryIssue {
  readonly code:
    | "INVALID_CONFIGURATION"
    | "INVALID_SCOPE"
    | "INVALID_ENTRY"
    | "UNKNOWN_NATIVE_CAPABILITY"
    | "PACK_NOT_REGISTERED"
    | "DUPLICATE_ENTRY"
    | "ENTRY_LIMIT_EXCEEDED"
    | "INVALID_QUERY";
  readonly path: string;
  readonly message: string;
}

export type ViraPrivateEnterpriseRegistryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraPrivateEnterpriseRegistryIssue };

export interface ViraPrivateEnterpriseRegistry {
  readonly version: typeof VIRA_PRIVATE_ENTERPRISE_REGISTRY_VERSION;
  readonly scope: ViraEnterpriseScope;
  approve(input: unknown): ViraPrivateEnterpriseRegistryResult<ViraPrivateEnterpriseRegistryEntry>;
  lookup(kind: unknown, id: unknown, versionRef: unknown): ViraPrivateEnterpriseRegistryResult<ViraPrivateEnterpriseRegistryEntry | null>;
  list(): readonly ViraPrivateEnterpriseRegistryEntry[];
}

export interface ViraPrivateEnterpriseRegistryConfiguration {
  readonly context: ViraEnterpriseContext;
  readonly environment: ViraEnterpriseEnvironmentName;
  readonly packRegistry: unknown;
  readonly approvedNativeCapabilities?: readonly string[];
}
