import type { ViraApplicationDistributionEnvelopeV2 } from "@vira-enterprise-genui/application-distribution";
import type {
  ViraApplicationFederationIssue,
  ViraApplicationFederationIssueCode,
} from "./types.js";

export const VIRA_APPLICATION_FEDERATION_V2_SCHEMA_VERSION = "2" as const;

export interface ViraApplicationFederationSourceV2 {
  readonly sourceId: string;
  readonly applications: readonly ViraApplicationDistributionEnvelopeV2[];
}

export interface ViraApplicationFederationSnapshotV2 {
  readonly schemaVersion: typeof VIRA_APPLICATION_FEDERATION_V2_SCHEMA_VERSION;
  readonly sources: readonly ViraApplicationFederationSourceV2[];
}

export interface ViraFederatedApplicationLookupV2 {
  readonly applicationId: string;
  readonly applicationVersion: string;
  readonly envelope: ViraApplicationDistributionEnvelopeV2 | null;
  readonly sourceIds: readonly string[];
}

export type ViraApplicationFederationV2IssueCode = ViraApplicationFederationIssueCode;
export type ViraApplicationFederationV2Issue = ViraApplicationFederationIssue;

export type ViraApplicationFederationV2Result =
  | { readonly ok: true; readonly value: ViraApplicationFederationSnapshotV2 }
  | { readonly ok: false; readonly issue: ViraApplicationFederationV2Issue };

export type ViraApplicationFederationV2SerializationResult =
  | { readonly ok: true; readonly value: string; readonly snapshot: ViraApplicationFederationSnapshotV2 }
  | { readonly ok: false; readonly issue: ViraApplicationFederationV2Issue };

export type ViraFederatedApplicationLookupV2Result =
  | { readonly ok: true; readonly value: ViraFederatedApplicationLookupV2 }
  | { readonly ok: false; readonly issue: ViraApplicationFederationV2Issue };
