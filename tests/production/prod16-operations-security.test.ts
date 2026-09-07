import { describe, expect, it } from "vitest";
import { createRestoreDryRunPlan } from "../../ops/backup/restore-plan.js";
import { sealViraReleaseManifest, verifySealedViraReleaseManifest } from "../../ops/deploy/release-manifest.js";
import { VIRA_PRODUCTION_SIGNALS } from "../../ops/observability/production-signals.js";
import { assertSafeProviderEndpoint, redactOperationalValue } from "../../ops/security/production-boundary.js";

const manifest = {
  version: "1", environment: "production", buildSha: "a".repeat(40), releaseId: "prod-16.1",
  webDeploymentId: "dpl_12345678", webDeploymentUrl: "https://vira-prod.vercel.app",
  apiDeploymentId: "11111111-1111-4111-8111-111111111111", workerDeploymentId: "22222222-2222-4222-8222-222222222222",
};

describe("PROD-16 immutable operations evidence", () => {
  it("seals an exact release manifest deterministically and rejects drift", () => {
    const first = sealViraReleaseManifest(manifest);
    expect(sealViraReleaseManifest({ ...manifest }).canonicalSha256).toBe(first.canonicalSha256);
    expect(verifySealedViraReleaseManifest(first)).toEqual(first);
    expect(() => verifySealedViraReleaseManifest({ ...first, manifest: { ...manifest, releaseId: "prod-16.2" } })).toThrow(/digest mismatch/);
  });

  it("creates deterministic non-production restore plans only", () => {
    const input = { backupRef: "railway/acme/2026-09-07T180000Z.dump", backupSha256: "b".repeat(64) };
    const plan = createRestoreDryRunPlan(input);
    expect(createRestoreDryRunPlan(input)).toEqual(plan);
    expect(plan).toMatchObject({ mode: "dry-run", targetEnvironment: "restore-verification" });
    expect(() => createRestoreDryRunPlan({ ...input, backupRef: "latest" })).toThrow(/exact/);
  });
});

describe("PROD-16 adversarial production boundaries", () => {
  it("redacts nested secrets without preserving secret-bearing keys", () => {
    const redacted = redactOperationalValue({ authorization: "Bearer abc", nested: { apiKey: "secret", safe: "ok" }, error: "Bearer leaked" });
    expect(redacted).toEqual({ authorization: "[REDACTED]", nested: { apiKey: "[REDACTED]", safe: "ok" }, error: "[REDACTED]" });
  });

  it.each(["http://api.github.com/x", "https://127.0.0.1/x", "https://169.254.169.254/latest", "https://evil.example/x", "https://user:pass@api.github.com/x"])("rejects SSRF/provider substitution endpoint %s", (endpoint) => {
    expect(() => assertSafeProviderEndpoint(endpoint, ["api.github.com"])).toThrow();
  });

  it("accepts only an explicitly allowlisted canonical provider host", () => {
    expect(assertSafeProviderEndpoint("https://api.github.com/repos/acme/vira", ["api.github.com"]).hostname).toBe("api.github.com");
  });

  it("defines bounded low-cardinality signals and actionable alerts", () => {
    expect(VIRA_PRODUCTION_SIGNALS.metrics).toHaveLength(6);
    expect(VIRA_PRODUCTION_SIGNALS.forbiddenLabels).toContain("session_token");
    expect(VIRA_PRODUCTION_SIGNALS.alerts.every((alert) => alert.runbook && alert.expression.includes(" for "))).toBe(true);
  });
});
