import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleViraWebBffRequest } from "../../apps/vira-web/api/bff.js";

const sessionToken = Buffer.alloc(32, 7).toString("base64url");
const csrfKey = Buffer.alloc(32, 9);
const serverKey = Buffer.alloc(32, 3);
const csrfToken = createHmac("sha256", csrfKey)
  .update(`vira-csrf-v1:${sessionToken}`)
  .digest("base64url");

const envKeys = [
  "VIRA_WEB_ORIGIN",
  "VIRA_RAILWAY_API_ORIGIN",
  "VIRA_BFF_CSRF_KEY_BASE64URL",
  "VIRA_BFF_SERVER_KEY_BASE64URL",
  "VIRA_BFF_RATE_LIMIT_URL",
  "VIRA_BFF_RATE_LIMIT_TOKEN",
] as const;

const savedEnv = new Map<string, string | undefined>();

function configuredRequest(body = JSON.stringify({ version: "1", input: { prompt: "hello" } })): Request {
  return new Request("https://app.example.com/api/bff", {
    method: "POST",
    headers: {
      cookie: `other=1; __Host-vira_session=${sessionToken}`,
      origin: "https://app.example.com",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json; charset=utf-8",
      "x-vira-csrf": csrfToken,
      "x-vira-target-path": "/v1/applications/run",
      "x-vira-organization-id": "acme",
      "x-vira-project-id": "alpha",
      "x-vira-environment": "staging",
    },
    body,
  });
}

beforeEach(() => {
  for (const key of envKeys) savedEnv.set(key, process.env[key]);
  process.env.VIRA_WEB_ORIGIN = "https://app.example.com";
  process.env.VIRA_RAILWAY_API_ORIGIN = "https://railway.example.com";
  process.env.VIRA_BFF_CSRF_KEY_BASE64URL = csrfKey.toString("base64url");
  process.env.VIRA_BFF_SERVER_KEY_BASE64URL = serverKey.toString("base64url");
  process.env.VIRA_BFF_RATE_LIMIT_URL = "https://rate.example.com/v1/consume";
  process.env.VIRA_BFF_RATE_LIMIT_TOKEN = "rate-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of envKeys) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnv.clear();
});

describe("PROD-03 Vercel same-origin BFF function", () => {
  it("keeps the browser token at Vercel and forwards only signed hash + scope truth", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ allowed: true }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": "must-not-pass=1" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleViraWebBffRequest(configuredRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [rateUrl, rateInit] = fetchMock.mock.calls[0]!;
    expect(String(rateUrl)).toBe("https://rate.example.com/v1/consume");
    expect(rateInit?.headers).toMatchObject({ authorization: "Bearer rate-secret" });
    const rateBody = JSON.parse(String(rateInit?.body)) as Record<string, unknown>;
    expect(rateBody.sessionIdHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rateBody)).not.toContain(sessionToken);
    expect(rateBody.scope).toEqual({ version: "1", organizationId: "acme", projectId: "alpha", environment: "staging" });

    const [railwayUrl, railwayInit] = fetchMock.mock.calls[1]!;
    expect(String(railwayUrl)).toBe("https://railway.example.com/v1/bff/proxy");
    const railwayHeaders = new Headers(railwayInit?.headers);
    expect(railwayHeaders.get("cookie")).toBeNull();
    expect(railwayHeaders.get("authorization")).toBeNull();
    expect(railwayHeaders.get("x-vira-bff-version")).toBe("1");
    expect(railwayHeaders.get("x-vira-bff-timestamp")).toMatch(/^\d+$/);
    expect(railwayHeaders.get("x-vira-bff-signature")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const railwayBody = String(railwayInit?.body);
    expect(railwayBody).not.toContain(sessionToken);
    expect(JSON.parse(railwayBody)).toMatchObject({
      version: "1",
      sessionIdHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      scope: { version: "1", organizationId: "acme", projectId: "alpha", environment: "staging" },
      method: "POST",
      path: "/v1/applications/run",
    });
  });

  it("fails closed when required BFF configuration is missing", async () => {
    delete process.env.VIRA_BFF_SERVER_KEY_BASE64URL;
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleViraWebBffRequest(configuredRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "bff_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies before rate-limit or Railway network calls", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleViraWebBffRequest(configuredRequest(JSON.stringify({ payload: "x".repeat(70_000) })));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "body_too_large" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the remote rate limiter is unavailable", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleViraWebBffRequest(configuredRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "rate_limit_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
