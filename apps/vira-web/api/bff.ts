import {
  VIRA_BFF_MAX_BODY_BYTES,
  VIRA_BROWSER_SESSION_COOKIE,
  prepareBrowserBffRequest,
  signBffServerRequest,
  type ViraBffRateLimiter,
} from "../../../integrations/browser-session/src/index.js";

const ingressPath = "/v1/bff/proxy";

function jsonError(status: number, code: string): Response {
  return Response.json({ error: code }, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function requiredEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

function secretKey(name: string): Uint8Array | undefined {
  const encoded = requiredEnv(name);
  if (!encoded || !/^[A-Za-z0-9_-]{43,}$/.test(encoded)) return undefined;
  try {
    const key = Buffer.from(encoded, "base64url");
    return key.byteLength >= 32 ? new Uint8Array(key) : undefined;
  } catch {
    return undefined;
  }
}

function httpsOrigin(name: string): string | undefined {
  const value = requiredEnv(name);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.pathname !== "/"
      || url.search !== ""
      || url.hash !== ""
      || url.username !== ""
      || url.password !== ""
    ) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function cookieValue(header: string | null, name: string): string | undefined {
  if (header === null) return undefined;
  const matches = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  return matches.length === 1 && matches[0] !== "" ? matches[0] : undefined;
}

async function readBoundedBody(request: Request): Promise<string | undefined> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d{1,10}$/.test(declaredLength) || Number(declaredLength) > VIRA_BFF_MAX_BODY_BYTES) return undefined;
  }
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > VIRA_BFF_MAX_BODY_BYTES) {
        await reader.cancel("body_too_large");
        return undefined;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  return body.toString("utf8");
}

function createRemoteRateLimiter(urlString: string, token: string): ViraBffRateLimiter | undefined {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return undefined;
  return Object.freeze({
    async consume(input: Parameters<ViraBffRateLimiter["consume"]>[0]) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ version: "1", ...input }),
        redirect: "error",
      });
      if (response.status === 429) return false;
      if (!response.ok) throw new Error("rate limiter unavailable");
      const body: unknown = await response.json();
      return body !== null
        && typeof body === "object"
        && !Array.isArray(body)
        && (body as Record<string, unknown>).allowed === true;
    },
  });
}

async function handle(request: Request): Promise<Response> {
  const webOrigin = httpsOrigin("VIRA_WEB_ORIGIN");
  const railwayOrigin = httpsOrigin("VIRA_RAILWAY_API_ORIGIN");
  const csrfKey = secretKey("VIRA_BFF_CSRF_KEY_BASE64URL");
  const serverKey = secretKey("VIRA_BFF_SERVER_KEY_BASE64URL");
  const rateLimitUrl = requiredEnv("VIRA_BFF_RATE_LIMIT_URL");
  const rateLimitToken = requiredEnv("VIRA_BFF_RATE_LIMIT_TOKEN");
  if (!webOrigin || !railwayOrigin || !csrfKey || !serverKey || !rateLimitUrl || !rateLimitToken) {
    return jsonError(503, "bff_not_configured");
  }
  const rateLimiter = createRemoteRateLimiter(rateLimitUrl, rateLimitToken);
  if (!rateLimiter) return jsonError(503, "bff_rate_limit_not_configured");

  const sessionToken = cookieValue(request.headers.get("cookie"), VIRA_BROWSER_SESSION_COOKIE);
  if (!sessionToken) return jsonError(401, "session_required");
  const targetPath = request.headers.get("x-vira-target-path") ?? "";
  const organizationId = request.headers.get("x-vira-organization-id") ?? "";
  const projectId = request.headers.get("x-vira-project-id") ?? "";
  const environment = request.headers.get("x-vira-environment") ?? "";
  const bodyText = await readBoundedBody(request);
  if (bodyText === undefined) return jsonError(413, "body_too_large");

  const prepared = await prepareBrowserBffRequest({
    method: request.method,
    path: targetPath,
    requestedScope: { version: "1", organizationId, projectId, environment },
    expectedOrigin: webOrigin,
    origin: request.headers.get("origin") ?? undefined,
    secFetchSite: request.headers.get("sec-fetch-site") ?? undefined,
    sessionToken,
    csrfToken: request.headers.get("x-vira-csrf") ?? undefined,
    csrfKey,
    contentType: request.headers.get("content-type") ?? undefined,
    bodyText,
    rateLimiter,
  });
  if (!prepared.ok) {
    const status = prepared.issue.code === "RATE_LIMITED" ? 429
      : prepared.issue.code === "RATE_LIMIT_UNAVAILABLE" ? 503
        : prepared.issue.code.includes("SESSION") ? 401
          : prepared.issue.code.includes("CSRF") || prepared.issue.code.includes("ORIGIN") || prepared.issue.code === "CROSS_SITE_REQUEST" ? 403
            : prepared.issue.code === "BODY_TOO_LARGE" ? 413
              : 400;
    return jsonError(status, prepared.issue.code.toLowerCase());
  }

  const ingressBody = JSON.stringify(prepared.value);
  const now = Math.floor(Date.now() / 1000);
  const signed = signBffServerRequest({
    method: "POST",
    path: ingressPath,
    bodyText: ingressBody,
    nowEpochSeconds: now,
    key: serverKey,
  });
  if (!signed.ok) return jsonError(503, "bff_signing_failed");

  let upstream: Response;
  try {
    upstream = await fetch(`${railwayOrigin}${ingressPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vira-bff-version": signed.value.version,
        "x-vira-bff-timestamp": signed.value.timestamp,
        "x-vira-bff-signature": signed.value.signature,
      },
      body: ingressBody,
      redirect: "error",
    });
  } catch {
    return jsonError(502, "bff_upstream_unavailable");
  }

  const headers = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
  for (const name of ["content-type", "content-disposition"] as const) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request): Promise<Response> {
    return handle(request);
  },
};

export { handle as handleViraWebBffRequest };
