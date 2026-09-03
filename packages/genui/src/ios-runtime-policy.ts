import {
  createRuntimePermissionPolicy,
  type RuntimePermissionEffect,
  type RuntimePermissionPolicy,
  type RuntimePermissionSubject,
} from "@vira-enterprise-genui/runtime-core";

export const VIRA_IOS_PERMISSION_PROJECTION_VERSION = "1" as const;

export interface ViraIOSPermissionRule {
  readonly subject: RuntimePermissionSubject;
  readonly id: string;
  readonly effect: RuntimePermissionEffect;
}

export interface ViraIOSPermissionPolicyProjection {
  readonly version: typeof VIRA_IOS_PERMISSION_PROJECTION_VERSION;
  readonly rules: readonly ViraIOSPermissionRule[];
}

export type ViraIOSPermissionPolicyProjectionResult =
  | { readonly ok: true; readonly value: ViraIOSPermissionPolicyProjection }
  | {
      readonly ok: false;
      readonly issue: {
        readonly code: "INVALID_PERMISSION_POLICY";
        readonly path: string;
        readonly message: string;
      };
    };

export function createViraIOSPermissionPolicyProjection(
  input: unknown,
): ViraIOSPermissionPolicyProjectionResult {
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
      version: VIRA_IOS_PERMISSION_PROJECTION_VERSION,
      rules: Object.freeze(policy.rules.map((rule) => Object.freeze({
        subject: rule.subject,
        id: rule.id,
        effect: rule.effect,
      }))),
    }),
  };
}
