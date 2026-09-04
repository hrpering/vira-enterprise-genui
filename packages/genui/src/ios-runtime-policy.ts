import {
  createViraNativePermissionPolicyProjection,
  VIRA_NATIVE_PERMISSION_PROJECTION_VERSION,
  type ViraNativePermissionPolicyProjection,
  type ViraNativePermissionPolicyProjectionResult,
  type ViraNativePermissionRule,
} from "./native-runtime-policy.js";

export const VIRA_IOS_PERMISSION_PROJECTION_VERSION = VIRA_NATIVE_PERMISSION_PROJECTION_VERSION;

export type ViraIOSPermissionRule = ViraNativePermissionRule;
export type ViraIOSPermissionPolicyProjection = ViraNativePermissionPolicyProjection;
export type ViraIOSPermissionPolicyProjectionResult = ViraNativePermissionPolicyProjectionResult;

export function createViraIOSPermissionPolicyProjection(
  input: unknown,
): ViraIOSPermissionPolicyProjectionResult {
  return createViraNativePermissionPolicyProjection(input);
}
