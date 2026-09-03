import {
  createViraNativePermissionPolicyProjection,
  VIRA_NATIVE_PERMISSION_PROJECTION_VERSION,
  type ViraNativePermissionPolicyProjection,
  type ViraNativePermissionPolicyProjectionResult,
  type ViraNativePermissionRule,
} from "./native-runtime-policy.js";

export const VIRA_ANDROID_PERMISSION_PROJECTION_VERSION = VIRA_NATIVE_PERMISSION_PROJECTION_VERSION;

export type ViraAndroidPermissionRule = ViraNativePermissionRule;
export type ViraAndroidPermissionPolicyProjection = ViraNativePermissionPolicyProjection;
export type ViraAndroidPermissionPolicyProjectionResult = ViraNativePermissionPolicyProjectionResult;

export function createViraAndroidPermissionPolicyProjection(
  input: unknown,
): ViraAndroidPermissionPolicyProjectionResult {
  return createViraNativePermissionPolicyProjection(input);
}
