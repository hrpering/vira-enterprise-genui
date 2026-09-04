import {
  createRuntimePermissionPolicy,
  type RuntimePermissionEffect,
  type RuntimePermissionPolicy,
  type RuntimePermissionSubject,
} from "@vira-enterprise-genui/runtime-core";

export const VIRA_NATIVE_PERMISSION_PROJECTION_VERSION = "1" as const;

export interface ViraNativePermissionRule {
  readonly subject: RuntimePermissionSubject;
  readonly id: string;
  readonly effect: RuntimePermissionEffect;
}

export interface ViraNativePermissionPolicyProjection {
  readonly version: typeof VIRA_NATIVE_PERMISSION_PROJECTION_VERSION;
  readonly rules: readonly ViraNativePermissionRule[];
}

export type ViraNativePermissionPolicyProjectionResult =
  | { readonly ok: true; readonly value: ViraNativePermissionPolicyProjection }
  | {
      readonly ok: false;
      readonly issue: {
        readonly code: "INVALID_PERMISSION_POLICY";
        readonly path: string;
        readonly message: string;
      };
    };

export function createViraNativePermissionPolicyProjection(
  input: unknown,
): ViraNativePermissionPolicyProjectionResult {
  let canonical: ReturnType<typeof createRuntimePermissionPolicy>;
  try {
    canonical = createRuntimePermissionPolicy(input);
  } catch {
    return {
      ok: false,
      issue: Object.freeze({
        code: "INVALID_PERMISSION_POLICY" as const,
        path: "$",
        message: "runtime permission policy could not be inspected safely",
      }),
    };
  }
  if (!canonical.ok) {
    return {
      ok: false,
      issue: Object.freeze({
        code: "INVALID_PERMISSION_POLICY" as const,
        path: canonical.issue.path,
        message: "runtime permission policy is invalid",
      }),
    };
  }
  const policy: RuntimePermissionPolicy = canonical.value;
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_NATIVE_PERMISSION_PROJECTION_VERSION,
      rules: Object.freeze(policy.rules.map((rule) => Object.freeze({
        subject: rule.subject,
        id: rule.id,
        effect: rule.effect,
      }))),
    }),
  };
}
