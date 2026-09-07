import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authorizeIdentityMembership,
  resolveDelegationChain,
  type ViraDelegationGrant,
  type ViraEnterprisePrincipal,
  type ViraEnterpriseScope,
  type ViraIdentityMembership,
} from "../../packages/enterprise-context/src/index.js";
import {
  verifyOidcJwt,
  type ViraOidcJsonWebKey,
} from "../../integrations/identity-oidc/src/index.js";

const now = 2_000_000_000;
const scope: ViraEnterpriseScope = Object.freeze({
  version: "1",
  organizationId: "acme",
  projectId: "alpha",
  environment: "staging",
});
const user: ViraEnterprisePrincipal = Object.freeze({
  version: "1",
  kind: "user",
  id: "user:alice",
  organizationId: "acme",
});
const agent: ViraEnterprisePrincipal = Object.freeze({
  version: "1",
  kind: "agent",
  id: "agent:planner",
  organizationId: "acme",
});
const service: ViraEnterprisePrincipal = Object.freeze({
  version: "1",
  kind: "service",
  id: "service:executor",
  organizationId: "acme",
});

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function rsaFixture() {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = keys.publicKey.export({ format: "jwk" });
  const kty = publicJwk.kty;
  if (typeof kty !== "string") throw new Error("RSA JWK is missing kty");
  const jwk: ViraOidcJsonWebKey = {
    ...publicJwk,
    kid: "key-1",
    alg: "RS256",
    use: "sig",
    kty,
  };
  return { ...keys, jwk };
}

function jwt(
  privateKey: ReturnType<typeof rsaFixture>["privateKey"],
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: "key-1", typ: "JWT" },
): string {
  const headerSegment = encode(header);
  const payloadSegment = encode(claims);
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

describe("PROD-03 OIDC verification", () => {
  it("cryptographically verifies issuer, audience, expiry and nonce", () => {
    const fixture = rsaFixture();
    const token = jwt(fixture.privateKey, {
      iss: "https://issuer.example",
      sub: "alice",
      aud: "vira-web",
      exp: now + 300,
      iat: now - 10,
      nonce: "nonce-1",
    });
    const result = verifyOidcJwt({
      token,
      configuration: {
        issuer: "https://issuer.example",
        audience: "vira-web",
        algorithms: ["RS256"],
        clockSkewSeconds: 0,
        maxTokenAgeSeconds: 600,
      },
      jwks: [fixture.jwk],
      expectedNonce: "nonce-1",
      nowEpochSeconds: now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issue.code);
    expect(result.value.subject).toBe("alice");
    expect(result.value.audience).toEqual(["vira-web"]);
  });

  it("rejects signature, issuer, audience, expiry and nonce confusion", () => {
    const trusted = rsaFixture();
    const attacker = rsaFixture();
    const baseClaims = {
      iss: "https://issuer.example",
      sub: "alice",
      aud: "vira-web",
      exp: now + 300,
      iat: now - 10,
      nonce: "nonce-1",
    };
    const configuration = {
      issuer: "https://issuer.example",
      audience: "vira-web",
      algorithms: ["RS256"] as const,
      clockSkewSeconds: 0,
    };

    expect(verifyOidcJwt({
      token: jwt(attacker.privateKey, baseClaims),
      configuration,
      jwks: [trusted.jwk],
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SIGNATURE" } });

    expect(verifyOidcJwt({
      token: jwt(trusted.privateKey, { ...baseClaims, iss: "https://evil.example" }),
      configuration,
      jwks: [trusted.jwk],
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_ISSUER" } });

    expect(verifyOidcJwt({
      token: jwt(trusted.privateKey, { ...baseClaims, aud: "other" }),
      configuration,
      jwks: [trusted.jwk],
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_AUDIENCE" } });

    expect(verifyOidcJwt({
      token: jwt(trusted.privateKey, { ...baseClaims, exp: now - 1 }),
      configuration,
      jwks: [trusted.jwk],
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "TOKEN_EXPIRED" } });

    expect(verifyOidcJwt({
      token: jwt(trusted.privateKey, baseClaims),
      configuration,
      jwks: [trusted.jwk],
      expectedNonce: "different",
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "NONCE_MISMATCH" } });
  });

  it("enforces an explicit workload audience", () => {
    const fixture = rsaFixture();
    const token = jwt(fixture.privateKey, {
      iss: "https://issuer.example",
      sub: "workload-7",
      aud: "vira:workload",
      exp: now + 300,
      iat: now - 5,
    });
    expect(verifyOidcJwt({
      token,
      configuration: {
        issuer: "https://issuer.example",
        audience: "vira:workload",
        algorithms: ["RS256"],
      },
      jwks: [fixture.jwk],
      nowEpochSeconds: now,
    }).ok).toBe(true);
    expect(verifyOidcJwt({
      token,
      configuration: {
        issuer: "https://issuer.example",
        audience: "vira-web",
        algorithms: ["RS256"],
      },
      jwks: [fixture.jwk],
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_AUDIENCE" } });
  });

  it("rejects malformed runtime verifier inputs without throwing", () => {
    expect(verifyOidcJwt(null)).toMatchObject({ ok: false, issue: { code: "INVALID_CONFIGURATION" } });
    expect(verifyOidcJwt({ configuration: null, jwks: [] })).toMatchObject({ ok: false, issue: { code: "INVALID_CONFIGURATION" } });
    expect(verifyOidcJwt({
      token: "bad",
      configuration: { issuer: "https://issuer.example", audience: "vira-web", algorithms: ["RS256"] },
      jwks: [{}],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_CONFIGURATION" } });
  });
});

describe("PROD-03 membership and delegation", () => {
  const identity = Object.freeze({
    version: "1" as const,
    issuer: "https://issuer.example",
    subject: "alice",
    audience: Object.freeze(["vira-web"]),
    expiresAt: now + 300,
    issuedAt: now - 10,
  });
  const membership: ViraIdentityMembership = Object.freeze({
    version: "1",
    membershipId: "membership-a",
    identityIssuer: "https://issuer.example",
    identitySubject: "alice",
    principal: user,
    scope,
    revision: 7,
    active: true,
  });

  it("binds verified identity to exact active membership and revision", () => {
    const result = authorizeIdentityMembership({
      identity,
      membership,
      requestedScope: scope,
      sessionMembershipRevision: 7,
      nowEpochSeconds: now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issue.code);
    expect(result.value.principal).toEqual(user);

    expect(authorizeIdentityMembership({
      identity,
      membership,
      requestedScope: scope,
      sessionMembershipRevision: 6,
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "STALE_MEMBERSHIP" } });

    expect(authorizeIdentityMembership({
      identity: { ...identity, subject: "mallory" },
      membership,
      requestedScope: scope,
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "IDENTITY_MISMATCH" } });
  });

  it("authorizes only a continuous exact-scope, exact-audience delegation chain", () => {
    const grant1: ViraDelegationGrant = Object.freeze({
      version: "1",
      grantId: "grant-1",
      scope,
      delegator: user,
      delegate: agent,
      audience: "vira:execute",
      issuedAt: now - 20,
      expiresAt: now + 200,
    });
    const grant2: ViraDelegationGrant = Object.freeze({
      version: "1",
      grantId: "grant-2",
      parentGrantId: "grant-1",
      scope,
      delegator: agent,
      delegate: service,
      audience: "vira:execute",
      issuedAt: now - 10,
      expiresAt: now + 100,
    });
    const result = resolveDelegationChain({
      authenticatedPrincipal: user,
      requestedPrincipal: service,
      scope,
      audience: "vira:execute",
      grants: [grant1, grant2],
      nowEpochSeconds: now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issue.code);
    expect(result.value.grantIds).toEqual(["grant-1", "grant-2"]);

    expect(resolveDelegationChain({
      authenticatedPrincipal: user,
      requestedPrincipal: service,
      scope,
      audience: "vira:other",
      grants: [grant1, grant2],
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "DELEGATION_AUDIENCE_MISMATCH" } });

    expect(resolveDelegationChain({
      authenticatedPrincipal: user,
      requestedPrincipal: service,
      scope,
      audience: "vira:execute",
      grants: [grant1, grant2],
      revokedGrantIds: ["grant-1"],
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "DELEGATION_REVOKED" } });

    expect(resolveDelegationChain({
      authenticatedPrincipal: user,
      requestedPrincipal: service,
      scope,
      audience: "vira:execute",
      grants: [grant1, { ...grant2, parentGrantId: "wrong" }],
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "DELEGATION_PARENT_MISMATCH" } });
  });

  it("rejects malformed membership/delegation runtime inputs without throwing", () => {
    expect(authorizeIdentityMembership(null)).toMatchObject({ ok: false, issue: { code: "INVALID_IDENTITY" } });
    expect(authorizeIdentityMembership({ identity, membership: {}, requestedScope: scope })).toMatchObject({ ok: false, issue: { code: "INVALID_IDENTITY" } });
    expect(resolveDelegationChain(null)).toMatchObject({ ok: false, issue: { code: "INVALID_DELEGATION" } });
    expect(resolveDelegationChain({ authenticatedPrincipal: user, requestedPrincipal: service, scope, audience: "vira:execute", grants: [{}] })).toMatchObject({ ok: false, issue: { code: "INVALID_DELEGATION" } });
  });
});
