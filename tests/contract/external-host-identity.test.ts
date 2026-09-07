import { describe, expect, it } from "vitest";
import {
  authorizeExternalHostContext,
  type ViraDelegationGrant,
  type ViraEnterprisePrincipal,
  type ViraEnterpriseScope,
  type ViraExternalHostBinding,
  type ViraIdentityMembership,
  type ViraVerifiedExternalIdentity,
} from "../../packages/enterprise-context/src/index.js";

const now = 2_000_000_000;
const scope: ViraEnterpriseScope = Object.freeze({
  version: "1",
  organizationId: "acme",
  projectId: "alpha",
  environment: "staging",
});
const otherScope: ViraEnterpriseScope = Object.freeze({
  version: "1",
  organizationId: "acme",
  projectId: "beta",
  environment: "staging",
});
const user: ViraEnterprisePrincipal = Object.freeze({
  version: "1",
  kind: "user",
  id: "user:alice",
  organizationId: "acme",
});
const workload: ViraEnterprisePrincipal = Object.freeze({
  version: "1",
  kind: "service",
  id: "service:external-host-workload",
  organizationId: "acme",
});
const audience = "vira:external-host:acme";
const binding: ViraExternalHostBinding = Object.freeze({
  version: "1",
  bindingId: "host-binding:chat",
  hostId: "host:external-chat",
  audience,
  authorizedParty: "client:external-chat",
  workloadPrincipal: workload,
});
const identity: ViraVerifiedExternalIdentity = Object.freeze({
  version: "1",
  issuer: "https://issuer.example",
  subject: "alice",
  audience: Object.freeze([audience]),
  expiresAt: now + 300,
  issuedAt: now - 10,
  authorizedParty: "client:external-chat",
});
const membership: ViraIdentityMembership = Object.freeze({
  version: "1",
  membershipId: "membership:alice",
  identityIssuer: identity.issuer,
  identitySubject: identity.subject,
  principal: user,
  scope,
  revision: 7,
  active: true,
});
const grant: ViraDelegationGrant = Object.freeze({
  version: "1",
  grantId: "grant:external-host",
  scope,
  delegator: user,
  delegate: workload,
  audience,
  issuedAt: now - 20,
  expiresAt: now + 200,
});

describe("PROD-18 provisional external host identity boundary", () => {
  it("binds exact host audience, tenant membership and delegation to one trusted workload principal", () => {
    const result = authorizeExternalHostContext({
      trustedBinding: binding,
      identity,
      membership,
      requestedScope: scope,
      grants: [grant],
      sessionMembershipRevision: 7,
      nowEpochSeconds: now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issue.code);
    expect(result.value).toMatchObject({
      version: "1",
      bindingId: "host-binding:chat",
      hostId: "host:external-chat",
      audience,
      identityIssuer: "https://issuer.example",
      identitySubject: "alice",
      authorizedParty: "client:external-chat",
      authenticatedPrincipal: user,
      workloadPrincipal: workload,
      scope,
      membershipId: "membership:alice",
      membershipRevision: 7,
      grantIds: ["grant:external-host"],
    });
    expect(Object.isFrozen(result.value)).toBe(true);
    expect("token" in result.value).toBe(false);
    expect("credential" in result.value).toBe(false);
    expect("execute" in result.value).toBe(false);
  });

  it("supports a directly authenticated machine workload without inventing a delegation grant", () => {
    const machineIdentity: ViraVerifiedExternalIdentity = Object.freeze({
      ...identity,
      subject: "workload-7",
    });
    const machineMembership: ViraIdentityMembership = Object.freeze({
      ...membership,
      membershipId: "membership:workload-7",
      identitySubject: "workload-7",
      principal: workload,
    });
    const result = authorizeExternalHostContext({
      trustedBinding: binding,
      identity: machineIdentity,
      membership: machineMembership,
      requestedScope: scope,
      grants: [],
      nowEpochSeconds: now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issue.code);
    expect(result.value.authenticatedPrincipal).toEqual(workload);
    expect(result.value.workloadPrincipal).toEqual(workload);
    expect(result.value.grantIds).toEqual([]);
  });

  it("rejects wrong-host audience before tenant or delegation authority can be reused", () => {
    expect(authorizeExternalHostContext({
      trustedBinding: binding,
      identity: { ...identity, audience: ["vira:other-host"] },
      membership,
      requestedScope: scope,
      grants: [grant],
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "HOST_AUDIENCE_MISMATCH" } });
  });

  it("rejects authorized-party drift when the trusted host binding pins an OIDC client", () => {
    expect(authorizeExternalHostContext({
      trustedBinding: binding,
      identity: { ...identity, authorizedParty: "client:other" },
      membership,
      requestedScope: scope,
      grants: [grant],
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "HOST_AUTHORIZED_PARTY_MISMATCH" } });
  });

  it("fails closed on cross-project membership reuse", () => {
    expect(authorizeExternalHostContext({
      trustedBinding: binding,
      identity,
      membership,
      requestedScope: otherScope,
      grants: [grant],
      nowEpochSeconds: now,
    })).toMatchObject({
      ok: false,
      issue: { code: "IDENTITY_AUTHORIZATION_FAILED", causeCode: "SCOPE_MISMATCH" },
    });
  });

  it("fails closed when any delegation grant in the host workload chain is revoked", () => {
    expect(authorizeExternalHostContext({
      trustedBinding: binding,
      identity,
      membership,
      requestedScope: scope,
      grants: [grant],
      revokedGrantIds: [grant.grantId],
      nowEpochSeconds: now,
    })).toMatchObject({
      ok: false,
      issue: { code: "DELEGATION_AUTHORIZATION_FAILED", causeCode: "DELEGATION_REVOKED" },
    });
  });

  it("fails closed when external identity evidence has expired", () => {
    expect(authorizeExternalHostContext({
      trustedBinding: binding,
      identity: { ...identity, expiresAt: now },
      membership,
      requestedScope: scope,
      grants: [grant],
      nowEpochSeconds: now,
    })).toMatchObject({
      ok: false,
      issue: { code: "IDENTITY_AUTHORIZATION_FAILED", causeCode: "INVALID_IDENTITY" },
    });
  });

  it("rejects user principals as trusted machine workload bindings", () => {
    expect(authorizeExternalHostContext({
      trustedBinding: { ...binding, workloadPrincipal: user },
      identity,
      membership,
      requestedScope: scope,
      grants: [],
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_HOST_AUTHORIZATION_INPUT" } });
  });
});
