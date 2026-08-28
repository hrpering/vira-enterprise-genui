export const POLICY_ADAPTER_CONTRACT_VERSION = "1" as const;
export const POLICY_ADAPTER_MAX_MAPPINGS = 128 as const;

export interface CompositionPolicyRefs {
  readonly layoutPolicy: string;
  readonly disclosurePolicy: string;
}

export interface PolicyAdapterMapping extends CompositionPolicyRefs {
  readonly recipe: string;
}

export interface PolicyAdapterContract {
  readonly version: typeof POLICY_ADAPTER_CONTRACT_VERSION;
  readonly id: string;
  readonly mappings: readonly PolicyAdapterMapping[];
}

export type PolicyAdapterValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_MAPPINGS"
  | "MAPPING_LIMIT_EXCEEDED"
  | "INVALID_RECIPE_ID"
  | "INVALID_POLICY_REFERENCE"
  | "DUPLICATE_RECIPE"
  | "INVALID_RECIPE"
  | "UNMAPPED_RECIPE";

export interface PolicyAdapterValidationIssue {
  readonly code: PolicyAdapterValidationCode;
  readonly path: string;
  readonly message: string;
}

export type PolicyAdapterContractResult =
  | { readonly ok: true; readonly value: PolicyAdapterContract }
  | { readonly ok: false; readonly issue: PolicyAdapterValidationIssue };

export type ResolvePolicyRefsResult =
  | { readonly ok: true; readonly value: CompositionPolicyRefs }
  | { readonly ok: false; readonly issue: PolicyAdapterValidationIssue };
