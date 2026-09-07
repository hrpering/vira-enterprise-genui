import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const verifier = path.join(root, "tooling/verify-prod13-local.mjs");

function run(flag: "--full" | "--live-provider") {
  const env = { ...process.env };
  delete env.VIRA_PROD13_LIVE_PROVIDER_ENABLED;
  return spawnSync(process.execPath, [verifier, flag], {
    cwd: root,
    env,
    encoding: "utf8",
  });
}

describe("PROD-13 live-provider closure contract", () => {
  it.each(["--full", "--live-provider"] as const)(
    "%s fails before any closure work when explicit real-provider opt-in is absent",
    (flag) => {
      const result = run(flag);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("PROD-13 real-provider proof is required for this invocation");
      expect(result.stderr).toContain("VIRA_PROD13_LIVE_PROVIDER_ENABLED=1");
    },
  );
});
