import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { cwd, execPath } from "node:process";
import { describe, expect, it } from "vitest";
import { parseViraReleaseManifest } from "../../ops/deploy/release-manifest.js";
import { parseViraRuntimeEnvironment, type ViraServiceName } from "../../ops/deploy/runtime-environment.js";
import { createViraServiceServer } from "../../ops/deploy/service-http.js";

const BASE_ENV: NodeJS.ProcessEnv = {
  VIRA_ENVIRONMENT: "staging",
  PORT: "3000",
  VIRA_BUILD_SHA: "0123456789abcdef0123456789abcdef01234567",
  VIRA_RELEASE_ID: "release-2026-09-05.1",
};

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("test server did not expose an IP port"));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
}

function buildWeb(env: NodeJS.ProcessEnv): Record<string, unknown> {
  const result = spawnSync(execPath, ["apps/vira-web/build.mjs"], {
    cwd: cwd(),
    env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`web build failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(readFileSync("apps/vira-web/dist/build.json", "utf8")) as Record<string, unknown>;
}

describe("PROD-01 runtime environment", () => {
  it("fails closed when required environment is missing", () => {
    const env = { ...BASE_ENV };
    delete env.VIRA_ENVIRONMENT;
    expect(() => parseViraRuntimeEnvironment(env, "vira-api")).toThrow(/VIRA_ENVIRONMENT is required/);
  });

  it("rejects invalid ports and environments", () => {
    expect(() => parseViraRuntimeEnvironment({ ...BASE_ENV, PORT: "0" }, "vira-api")).toThrow(/PORT/);
    expect(() => parseViraRuntimeEnvironment({ ...BASE_ENV, VIRA_ENVIRONMENT: "prod" }, "vira-api")).toThrow(/development, staging or production/);
  });

  it("accepts Railway-provided immutable deployment metadata", () => {
    const env = { ...BASE_ENV };
    delete env.VIRA_BUILD_SHA;
    delete env.VIRA_RELEASE_ID;
    env.RAILWAY_GIT_COMMIT_SHA = "abcdef0123456789abcdef0123456789abcdef01";
    env.RAILWAY_DEPLOYMENT_ID = "11111111-1111-4111-8111-111111111111";
    const parsed = parseViraRuntimeEnvironment(env, "vira-worker");
    expect(parsed.buildSha).toBe("abcdef0123456789abcdef0123456789abcdef01");
    expect(parsed.releaseId).toBe("11111111-1111-4111-8111-111111111111");
  });
});

describe("PROD-01 health surfaces", () => {
  for (const service of ["vira-api", "vira-worker"] as const satisfies readonly ViraServiceName[]) {
    it(`${service} exposes only shell health/readiness/build endpoints`, async () => {
      const config = parseViraRuntimeEnvironment(BASE_ENV, service);
      const server = createViraServiceServer(config);
      const port = await listen(server);
      try {
        const health = await fetch(`http://127.0.0.1:${port}/healthz`);
        expect(health.status).toBe(200);
        expect(await health.json()).toEqual({ status: "ok", service, environment: "staging" });

        const ready = await fetch(`http://127.0.0.1:${port}/readyz`);
        expect(ready.status).toBe(200);

        const build = await fetch(`http://127.0.0.1:${port}/build`);
        expect(build.status).toBe(200);
        expect(await build.json()).toMatchObject({
          service,
          buildSha: BASE_ENV.VIRA_BUILD_SHA,
          releaseId: BASE_ENV.VIRA_RELEASE_ID,
        });

        expect((await fetch(`http://127.0.0.1:${port}/actions`)).status).toBe(404);
        expect((await fetch(`http://127.0.0.1:${port}/healthz`, { method: "POST" })).status).toBe(405);
      } finally {
        await close(server);
      }
    });
  }
});

describe("PROD-01 web deployment metadata", () => {
  it("maps Vercel preview to staging and records exact deployment identity", () => {
    const metadata = buildWeb({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_SHA: "abcdef0123456789abcdef0123456789abcdef01",
      VERCEL_DEPLOYMENT_ID: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
    });
    expect(metadata).toMatchObject({
      service: "vira-web",
      environment: "staging",
      buildSha: "abcdef0123456789abcdef0123456789abcdef01",
      releaseId: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
    });
  });

  it("uses Vercel custom staging target and rejects unknown environments", () => {
    expect(buildWeb({
      VERCEL_TARGET_ENV: "staging",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_SHA: "abcdef0123456789abcdef0123456789abcdef01",
      VERCEL_DEPLOYMENT_ID: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
    })).toMatchObject({ environment: "staging" });

    const result = spawnSync(execPath, ["apps/vira-web/build.mjs"], {
      cwd: cwd(),
      env: { VERCEL_TARGET_ENV: "qa" },
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/development, staging or production/);
  });
});

describe("PROD-01 immutable release manifest", () => {
  const manifest = {
    version: "1",
    environment: "staging",
    buildSha: "0123456789abcdef0123456789abcdef01234567",
    releaseId: "release-2026-09-05.1",
    webDeploymentId: "dpl_0123456789abcdef",
    webDeploymentUrl: "https://vira-preview-012345.vercel.app",
    apiDeploymentId: "11111111-1111-4111-8111-111111111111",
    workerDeploymentId: "22222222-2222-4222-8222-222222222222",
  };

  it("accepts exact platform deployment identities", () => {
    expect(parseViraReleaseManifest(manifest)).toMatchObject({ version: "1", environment: "staging" });
  });

  it("rejects floating or malformed deployment references", () => {
    expect(() => parseViraReleaseManifest({ ...manifest, webDeploymentId: "latest" })).toThrow(/exact Vercel deployment ID/);
    expect(() => parseViraReleaseManifest({ ...manifest, apiDeploymentId: "latest" })).toThrow(/exact Railway deployment UUIDs/);
  });

  it("rejects one Railway deployment reused for both services", () => {
    expect(() => parseViraReleaseManifest({ ...manifest, workerDeploymentId: manifest.apiDeploymentId })).toThrow(/independent Railway deployments/);
  });

  it("rejects unknown fields and insecure or non-Vercel URL evidence", () => {
    expect(() => parseViraReleaseManifest({ ...manifest, unexpected: "value" })).toThrow(/unknown fields/);
    expect(() => parseViraReleaseManifest({ ...manifest, webDeploymentUrl: "http://example.test" })).toThrow(/HTTPS Vercel deployment URL/);
    expect(() => parseViraReleaseManifest({ ...manifest, webDeploymentUrl: "https://tryvira.xyz" })).toThrow(/HTTPS Vercel deployment URL/);
  });
});
