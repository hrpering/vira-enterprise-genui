import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  fetchOidcDiscoveryAndJwks,
  verifyOidcJwt,
  type ViraOidcJsonWebKey,
} from "../../integrations/identity-oidc/src/index.js";

const now = 2_000_000_000;
const issuer = "https://issuer.example";
const jwksUri = "https://keys.example.net/oidc/jwks";

function fixture() {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = keys.publicKey.export({ format: "jwk" });
  const kty = publicJwk.kty;
  if (typeof kty !== "string") throw new Error("RSA JWK is missing kty");
  const jwk: ViraOidcJsonWebKey = {
    ...publicJwk,
    kid: "prod-key-1",
    alg: "RS256",
    use: "sig",
    kty,
  };
  return { ...keys, jwk };
}

function token(privateKey: ReturnType<typeof fixture>["privateKey"]): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "prod-key-1", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: issuer,
    sub: "alice",
    aud: "vira-web",
    exp: now + 300,
    iat: now - 10,
  })).toString("base64url");
  const input = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url");
  return `${input}.${signature}`;
}

describe("PROD-03 bounded OIDC discovery transport", () => {
  it("binds explicit issuer/JWKS configuration to keys that pass real signature verification", async () => {
    const rsa = fixture();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ issuer, jwks_uri: jwksUri }))
      .mockResolvedValueOnce(Response.json({ keys: [rsa.jwk] }));

    const discovered = await fetchOidcDiscoveryAndJwks({ issuer, expectedJwksUri: jwksUri }, fetcher);
    expect(discovered.ok).toBe(true);
    if (!discovered.ok) throw new Error(discovered.issue.code);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`${issuer}/.well-known/openid-configuration`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" });
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(jwksUri);

    const verified = verifyOidcJwt({
      token: token(rsa.privateKey),
      configuration: { issuer, audience: "vira-web", algorithms: ["RS256"], clockSkewSeconds: 0 },
      jwks: discovered.value.jwks,
      nowEpochSeconds: now,
    });
    expect(verified).toMatchObject({ ok: true, value: { issuer, subject: "alice", audience: ["vira-web"] } });
  });

  it("fails closed when a structurally valid JWK has the wrong key type for the JWT algorithm", () => {
    const rsa = fixture();
    const wrongPublicJwk = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" });
    const kty = wrongPublicJwk.kty;
    if (typeof kty !== "string") throw new Error("Ed25519 JWK is missing kty");
    const mismatchedJwk: ViraOidcJsonWebKey = {
      ...wrongPublicJwk,
      kid: "prod-key-1",
      alg: "RS256",
      use: "sig",
      kty,
    };

    const result = verifyOidcJwt({
      token: token(rsa.privateKey),
      configuration: { issuer, audience: "vira-web", algorithms: ["RS256"], clockSkewSeconds: 0 },
      jwks: [mismatchedJwk],
      nowEpochSeconds: now,
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_SIGNATURE" } });
  });

  it("does not follow a discovery-controlled JWKS URL that differs from explicit configuration", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ issuer, jwks_uri: "https://attacker.example/jwks" }));
    expect(await fetchOidcDiscoveryAndJwks({ issuer, expectedJwksUri: jwksUri }, fetcher))
      .toMatchObject({ ok: false, issue: { code: "OIDC_JWKS_URI_MISMATCH" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects issuer confusion, oversized responses and duplicate key ids", async () => {
    const wrongIssuer = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ issuer: "https://other.example", jwks_uri: jwksUri }));
    expect(await fetchOidcDiscoveryAndJwks({ issuer, expectedJwksUri: jwksUri }, wrongIssuer))
      .toMatchObject({ ok: false, issue: { code: "OIDC_ISSUER_MISMATCH" } });

    const oversized = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json", "content-length": "300000" },
      }));
    expect(await fetchOidcDiscoveryAndJwks({ issuer, expectedJwksUri: jwksUri }, oversized))
      .toMatchObject({ ok: false, issue: { code: "OIDC_RESPONSE_TOO_LARGE" } });

    const rsa = fixture();
    const duplicate = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ issuer, jwks_uri: jwksUri }))
      .mockResolvedValueOnce(Response.json({ keys: [rsa.jwk, rsa.jwk] }));
    expect(await fetchOidcDiscoveryAndJwks({ issuer, expectedJwksUri: jwksUri }, duplicate))
      .toMatchObject({ ok: false, issue: { code: "OIDC_JWKS_INVALID" } });
  });

  it("rejects malformed discovery configuration without network access", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await fetchOidcDiscoveryAndJwks(null, fetcher))
      .toMatchObject({ ok: false, issue: { code: "INVALID_DISCOVERY_CONFIGURATION" } });
    expect(await fetchOidcDiscoveryAndJwks({ issuer: "http://issuer.example", expectedJwksUri: jwksUri }, fetcher))
      .toMatchObject({ ok: false, issue: { code: "INVALID_DISCOVERY_CONFIGURATION" } });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
