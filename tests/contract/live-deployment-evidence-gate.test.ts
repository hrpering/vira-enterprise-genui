import { spawnSync } from "node:child_process";
import { execPath } from "node:process";
import { describe, expect, it } from "vitest";

const verifier = "tooling/verify-live-deployment-evidence.mjs";
const controlledKeys = [
  "VIRA_RELEASE_MANIFEST_JSON",
  "VIRA_RAILWAY_API_ORIGIN",
  "VIRA_RAILWAY_WORKER_ORIGIN",
  "VIRA_DEPLOYMENT_BFF_PROBE_JSON",
  "VIRA_VERCEL_PROTECTION_BYPASS",
] as const;

function cleanEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of controlledKeys) delete env[key];
  return env;
}

function run(env: NodeJS.ProcessEnv) {
  return spawnSync(execPath, [verifier], {
    env,
    encoding: "utf8",
  });
}

describe("live deployment evidence release gate", () => {
  it("fails closed before network access when release authority is absent", () => {
    const result = run(cleanEnvironment());
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    const evidence = JSON.parse(result.stderr) as Record<string, unknown>;
    expect(evidence).toMatchObject({
      version: "1",
      gate: "live-deployment-evidence",
      authority: "live-http",
      closureEligible: false,
      message: "VIRA_RELEASE_MANIFEST_JSON is required",
      requiredEnvironment: ["VIRA_RELEASE_MANIFEST_JSON"],
    });
  });

  it("rejects floating deployment references before any live HTTP proof", () => {
    const env = cleanEnvironment();
    env.VIRA_RELEASE_MANIFEST_JSON = JSON.stringify({
      version: "1",
      environment: "staging",
      buildSha: "abcdef0123456789abcdef0123456789abcdef01",
      releaseId: "release-2026-09-07.1",
      webDeploymentId: "latest",
      webDeploymentUrl: "https://vira-preview.vercel.app",
      apiDeploymentId: "11111111-1111-4111-8111-111111111111",
      workerDeploymentId: "22222222-2222-4222-8222-222222222222",
    });
    const result = run(env);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    const evidence = JSON.parse(result.stderr) as Record<string, unknown>;
    expect(evidence).toMatchObject({
      gate: "live-deployment-evidence",
      authority: "live-http",
      closureEligible: false,
      message: "webDeploymentId must be an exact Vercel deployment ID",
    });
  });
});
