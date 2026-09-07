import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const verifier = path.join(root, "tooling/verify-main-governance.mjs");

describe("main governance release gate", () => {
  it("fails closed before any GitHub request when admin-read authority is absent", () => {
    const env = { ...process.env };
    delete env.VIRA_GITHUB_ADMIN_READ_TOKEN;
    delete env.GITHUB_TOKEN;

    const result = spawnSync(process.execPath, [verifier], {
      cwd: root,
      env,
      encoding: "utf8",
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");

    const evidence = JSON.parse(result.stderr);
    expect(evidence).toMatchObject({
      version: "1",
      gate: "main-governance",
      authority: "live-github-api",
      repository: "hrpering/vira-enterprise-genui",
      branch: "main",
      closureEligible: false,
      message: "GitHub admin-read token is required",
    });
    expect(evidence.requiredChecks).toEqual(["verify", "ios-native", "android-native"]);
  });
});
