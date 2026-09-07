import {
  authorizeIdentityMembership,
  resolveDelegationChain,
  type ViraDelegationGrant,
  type ViraIdentityDelegationIssueCode,
  type ViraIdentityMembership,
  type ViraVerifiedExternalIdentity,
} from "./identity.js";
import type {
  ViraEnterprisePrincipal,
  ViraEnterpriseScope,
} from "./types.js";

export const VIRA_EXTERNAL_HOST_AUTHORIZATION_VERSION = "1" as const;

export interface ViraExternalHostBinding {
  readonly version: typeof VIRA_EXTERNAL_HOST_AUTHORIZATION_VERSION;
  readonly bindingId: string;
  readonly hostId: string;
  readonly audience: string;
  readonly workloadPrincipal: ViraEnterprisePrincipal;
  readonly authorizedParty?: string;
}

export interface ViraExternalHostAuthorizationInput {
  readonly trustedBinding: ViraExternalHostBinding;
  readonly identity: ViraVerifiedExternalIdentity;
  readonly membership: ViraIdentityMembership;
  readonly requestedScope: ViraEnterpriseScope;
  readonly grants: readonly ViraDelegationGrant[];
  readonly revokedGrantIds?: readonly string[];
  readonly sessionMembershipRevision?: number;
  readonly nowEpochSeconds?: number;
}

export type ViraExternalHostAuthorizationIssueCode =
  | "INVALID_HOST_AUTHORIZATION_INPUT"
  | "INVALID_HOST_BINDING"
  | "HOST_AUDIENCE_MISMATCH"
  | "HOST_AUTHORIZED_PARTY_MISMATCH"
  | "IDENTITY_AUTHORIZATION_FAILED"
  | "DELEGATION_AUTHORIZATION_FAILED"
  | "HOST_WORKLOAD_MISMATCH";

export interface ViraExternalHostAuthorizationIssue {
  readonly code: ViraExternalHostAuthorizationIssueCode;
  readonly path: string;
  readonly message: string;
  readonly causeCode?: ViraIdentityDelegationIssueCode;
}

export interface ViraExternalHostAuthorization {
  readonly version: typeof VIRA_EXTERNAL_HOST_AUTHORIZATION_VERSION;
  readonly bindingId: string;
  readonly hostId: string;
  readonly audience: string;
  readonly identityIssuer: string;
  readonly identitySubject: string;
  readonly identityExpiresAt: number;
  readonly authorizedParty?: string;
  readonly authenticatedPrincipal: ViraEnterprisePrincipal;
  readonly workloadPrincipal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
  readonly membershipId: string;
  readonly membershipRevision: number;
  readonly grantIds: readonly string[];
}

export type ViraExternalHostAuthorizationResult =
  | { readonly ok: true; readonly value: ViraExternalHostAuthorization }
  | { readonly ok: false; readonly issue: ViraExternalHostAuthorizationIssue };

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(
  code: ViraExternalHostAuthorizationIssueCode,
  path: string,
  message: string,
  causeCode?: ViraIdentityDelegationIssueCode,
): ViraExternalHostAuthorizationResult {
  return {
    ok: false,
    issue: Object.freeze({
      code,
      path,
      message,
      ...(causeCode === undefined ? {} : { causeCode }),
    }),
  };
}

function workloadPrincipalShape(value: unknown): value is ViraEnterprisePrincipal {
  return record(value)
    && value.version === "1"
    && (value.kind === "agent" || value.kind === "service")
    && typeof value.id === "string"
    && idPattern.test(value.id)
    && typeof value.organizationId === "string"
    && idPattern.test(value.organizationId)
    && Object.keys(value).every((key) => ["version", "kind", "id", "organizationId"].includes(key));
}

function bindingShape(value: unknown): value is ViraExternalHostBinding {
  return record(value)
    && value.version === VIRA_EXTERNAL_HOST_AUTHORIZATION_VERSION
    && typeof value.bindingId === "string"
    && idPattern.test(value.bindingId)
    && typeof value.hostId === "string"
    && idPattern.test(value.hostId)
    && typeof value.audience === "string"
    && value.audience.length > 0
    && value.audience.length <= 256
    && workloadPrincipalShape(value.workloadPrincipal)
    && (value.authorizedParty === undefined
      || (typeof value.authorizedParty === "string" && value.authorizedParty.length > 0 && value.authorizedParty.length <= 256))
    && Object.keys(value).every((key) => ["version", "bindingId", "hostId", "audience", "workloadPrincipal", "authorizedParty"].includes(key));
}

function exactPrincipal(left: ViraEnterprisePrincipal, right: ViraEnterprisePrincipal): boolean {
  return left.version === right.version
    && left.kind === right.kind
    && left.id === right.id
    && left.organizationId === right.organizationId;
}

function canonicalBinding(binding: ViraExternalHostBinding): ViraExternalHostBinding {
  return Object.freeze({
    version: VIRA_EXTERNAL_HOST_AUTHORIZATION_VERSION,
    bindingId: binding.bindingId,
    hostId: binding.hostId,
    audience: binding.audience,
    workloadPrincipal: Object.freeze({ ...binding.workloadPrincipal }),
    ...(binding.authorizedParty === undefined ? {} : { authorizedParty: binding.authorizedParty }),
  });
}

export function authorizeExternalHostContext(input: unknown): ViraExternalHostAuthorizationResult {
  if (!record(input) || !bindingShape(input.trustedBinding) || !record(input.identity)) {
    return issue(
      "INVALID_HOST_AUTHORIZATION_INPUT",
      "$",
      "external host authorization input is invalid",
    );
  }
  if (input.grants !== undefined && !Array.isArray(input.grants)) {
    return issue(
      "INVALID_HOST_AUTHORIZATION_INPUT",
      "$.grants",
      "external host delegation grants must be an array",
    );
  }
  if (
    input.revokedGrantIds !== undefined
    && (!Array.isArray(input.revokedGrantIds) || !input.revokedGrantIds.every((value) => typeof value === "string"))
  ) {
    return issue(
      "INVALID_HOST_AUTHORIZATION_INPUT",
      "$.revokedGrantIds",
      "external host revoked grant ids must be an array of strings",
    );
  }

  const binding = canonicalBinding(input.trustedBinding);
  const audiences = input.identity.audience;
  if (
    !Array.isArray(audiences)
    || audiences.length < 1
    || audiences.length > 16
    || !audiences.every((value) => typeof value === "string")
  ) {
    return issue(
      "INVALID_HOST_AUTHORIZATION_INPUT",
      "$.identity.audience",
      "verified identity audience is invalid",
    );
  }
  if (!audiences.includes(binding.audience)) {
    return issue(
      "HOST_AUDIENCE_MISMATCH",
      "$.identity.audience",
      "verified identity is not issued for the trusted external host audience",
    );
  }
  if (binding.authorizedParty !== undefined && input.identity.authorizedParty !== binding.authorizedParty) {
    return issue(
      "HOST_AUTHORIZED_PARTY_MISMATCH",
      "$.identity.authorizedParty",
      "verified identity authorized party does not match the trusted external host binding",
    );
  }

  const membership = authorizeIdentityMembership({
    identity: input.identity,
    membership: input.membership,
    requestedScope: input.requestedScope,
    ...(input.sessionMembershipRevision === undefined ? {} : { sessionMembershipRevision: input.sessionMembershipRevision }),
    ...(input.nowEpochSeconds === undefined ? {} : { nowEpochSeconds: input.nowEpochSeconds }),
  });
  if (!membership.ok) {
    return issue(
      "IDENTITY_AUTHORIZATION_FAILED",
      membership.issue.path,
      membership.issue.message,
      membership.issue.code,
    );
  }

  const delegation = resolveDelegationChain({
    authenticatedPrincipal: membership.value.principal,
    requestedPrincipal: binding.workloadPrincipal,
    scope: membership.value.scope,
    audience: binding.audience,
    grants: input.grants ?? [],
    ...(input.revokedGrantIds === undefined ? {} : { revokedGrantIds: input.revokedGrantIds }),
    ...(input.nowEpochSeconds === undefined ? {} : { nowEpochSeconds: input.nowEpochSeconds }),
  });
  if (!delegation.ok) {
    return issue(
      "DELEGATION_AUTHORIZATION_FAILED",
      delegation.issue.path,
      delegation.issue.message,
      delegation.issue.code,
    );
  }
  if (!exactPrincipal(delegation.value.principal, binding.workloadPrincipal)) {
    return issue(
      "HOST_WORKLOAD_MISMATCH",
      "$.trustedBinding.workloadPrincipal",
      "delegation result does not resolve to the trusted host workload principal",
    );
  }

  const identity = input.identity as unknown as ViraVerifiedExternalIdentity;
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_EXTERNAL_HOST_AUTHORIZATION_VERSION,
      bindingId: binding.bindingId,
      hostId: binding.hostId,
      audience: binding.audience,
      identityIssuer: identity.issuer,
      identitySubject: identity.subject,
      identityExpiresAt: identity.expiresAt,
      ...(identity.authorizedParty === undefined ? {} : { authorizedParty: identity.authorizedParty }),
      authenticatedPrincipal: membership.value.principal,
      workloadPrincipal: delegation.value.principal,
      scope: delegation.value.scope,
      membershipId: membership.value.membershipId,
      membershipRevision: membership.value.membershipRevision,
      grantIds: Object.freeze([...delegation.value.grantIds]),
    }),
  };
}
