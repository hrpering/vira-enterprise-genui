import type {
  ViraCapabilityDefinition,
  ViraCapabilityExactReference,
} from "@vira-enterprise-genui/capability-contract";
import type {
  ViraEnterprisePrincipal,
  ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import type { JsonValue } from "@vira-enterprise-genui/protocol";
import type { ViraWorkContext } from "@vira-enterprise-genui/work-context";

export const VIRA_HOSTED_CAPABILITY_RUNTIME_VERSION = "1" as const;
export const VIRA_HOSTED_CAPABILITY_MAX_CONTEXTS = 128 as const;
export const VIRA_HOSTED_CAPABILITY_INVOCATION_ID_MAX_LENGTH = 256 as const;
export const VIRA_HOSTED_CAPABILITY_FAILURE_CODE_MAX_LENGTH = 128 as const;

export const VIRA_HOSTED_CAPABILITY_OUTCOMES = Object.freeze([
  "success",
  "empty",
  "error",
] as const);

export type ViraHostedCapabilityOutcome = (typeof VIRA_HOSTED_CAPABILITY_OUTCOMES)[number];

export interface ViraHostedCapabilityBinding {
  readonly version: typeof VIRA_HOSTED_CAPABILITY_RUNTIME_VERSION;
  readonly bindingRef: ViraCapabilityExactReference;
  readonly capabilityRef: ViraCapabilityExactReference;
  readonly providerId: string;
  readonly locationId: string | null;
}

export interface ViraHostedCapabilityValue {
  readonly typeRef: ViraCapabilityExactReference | null;
  readonly value: JsonValue;
}

export interface ViraHostedCapabilityRequest {
  readonly version: typeof VIRA_HOSTED_CAPABILITY_RUNTIME_VERSION;
  readonly invocationId: string;
  readonly principal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
  readonly input: ViraHostedCapabilityValue;
  readonly contexts: readonly ViraWorkContext[];
}

export interface ViraHostedCapabilityProviderFailure {
  readonly code: string;
}

export type ViraHostedCapabilityAdapterResult =
  | {
      readonly outcome: "success";
      readonly output: ViraHostedCapabilityValue;
    }
  | {
      readonly outcome: "empty";
    }
  | {
      readonly outcome: "error";
      readonly failure: ViraHostedCapabilityProviderFailure;
    };

export interface ViraHostedCapabilityAdapterInput {
  readonly invocationId: string;
  readonly capability: ViraCapabilityDefinition;
  readonly binding: ViraHostedCapabilityBinding;
  readonly principal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
  readonly input: ViraHostedCapabilityValue;
  readonly contexts: readonly ViraWorkContext[];
}

export type ViraHostedCapabilityAdapter = (
  input: ViraHostedCapabilityAdapterInput,
) => Promise<unknown> | unknown;

export interface ViraHostedCapabilityExecutionEvidence {
  readonly version: typeof VIRA_HOSTED_CAPABILITY_RUNTIME_VERSION;
  readonly invocationId: string;
  readonly capabilityRef: ViraCapabilityExactReference;
  readonly bindingRef: ViraCapabilityExactReference;
  readonly providerId: string;
  readonly locationId: string | null;
  readonly outcome: ViraHostedCapabilityOutcome;
  readonly output?: ViraHostedCapabilityValue;
  readonly failure?: ViraHostedCapabilityProviderFailure;
}

export type ViraHostedCapabilityRuntimeIssueCode =
  | "INVALID_CAPABILITY"
  | "INVALID_BINDING"
  | "INVALID_REFERENCE"
  | "FLOATING_REFERENCE"
  | "CAPABILITY_MISMATCH"
  | "ACTION_BOUNDARY_REQUIRED"
  | "INVALID_REQUEST"
  | "INVALID_PRINCIPAL_SCOPE"
  | "INVALID_INPUT_VALUE"
  | "INPUT_TYPE_MISMATCH"
  | "CONTEXT_LIMIT_EXCEEDED"
  | "INVALID_CONTEXT"
  | "DUPLICATE_CONTEXT"
  | "MISSING_CONTEXT"
  | "UNDECLARED_CONTEXT"
  | "ADAPTER_FAILED"
  | "INVALID_ADAPTER_RESULT"
  | "OUTPUT_TYPE_MISMATCH";

export interface ViraHostedCapabilityRuntimeIssue {
  readonly code: ViraHostedCapabilityRuntimeIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraHostedCapabilityExecutionResult =
  | { readonly ok: true; readonly value: ViraHostedCapabilityExecutionEvidence }
  | { readonly ok: false; readonly issue: ViraHostedCapabilityRuntimeIssue };
