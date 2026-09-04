import { describe, expect, it } from "vitest";
import { createViraEnterpriseContext } from "../../packages/enterprise-context/src/index.js";

describe("MASTER-12 enterprise context", () => {
  it("creates exact registered environment scopes", () => {
    const created = createViraEnterpriseContext({
      organizationId: "acme",
      projectId: "checkout",
      environments: ["dev", "production"],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.scope("dev")).toEqual({
      ok: true,
      value: { version: "1", organizationId: "acme", projectId: "checkout", environment: "dev" },
    });
    const missing = created.value.scope("staging");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issue.code).toBe("ENVIRONMENT_NOT_REGISTERED");
  });

  it("rejects cross-organization principals", () => {
    const created = createViraEnterpriseContext({ organizationId: "acme", projectId: "checkout", environments: ["dev"] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = created.value.principal({
      version: "1",
      kind: "agent",
      id: "agent-1",
      organizationId: "other",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("CROSS_ORGANIZATION");
  });

  it("rejects cross-project and cross-environment SecretRefs", async () => {
    const created = createViraEnterpriseContext({ organizationId: "acme", projectId: "checkout", environments: ["dev", "production"] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const foreign = created.value.secretRef({
      version: "1",
      organizationId: "acme",
      projectId: "billing",
      environment: "dev",
      provider: "vault.hashicorp",
      key: "stripe/api-key",
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.issue.code).toBe("CROSS_PROJECT_SECRET");

    const scope = created.value.scope("production");
    expect(scope.ok).toBe(true);
    if (!scope.ok) return;
    const secret = created.value.secretRef({
      version: "1",
      organizationId: "acme",
      projectId: "checkout",
      environment: "dev",
      provider: "vault.hashicorp",
      key: "stripe/api-key",
    });
    expect(secret.ok).toBe(true);
    if (!secret.ok) return;
    const lease = await created.value.leaseSecret(scope.value, secret.value, {
      issueLease: () => ({
        version: "1",
        leaseRef: "lease:1",
        organizationId: "acme",
        projectId: "checkout",
        environment: "production",
        provider: "vault.hashicorp",
        key: "stripe/api-key",
      }),
    });
    expect(lease.ok).toBe(false);
    if (!lease.ok) expect(lease.issue.code).toBe("CROSS_PROJECT_SECRET");
  });

  it("returns only an opaque scope-bound secret lease and rejects raw secret-shaped broker output", async () => {
    const created = createViraEnterpriseContext({ organizationId: "acme", projectId: "checkout", environments: ["production"] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const scope = created.value.scope("production");
    expect(scope.ok).toBe(true);
    if (!scope.ok) return;
    const secret = created.value.secretRef({
      version: "1",
      organizationId: "acme",
      projectId: "checkout",
      environment: "production",
      provider: "vault.hashicorp",
      key: "stripe/api-key",
      versionRef: "42",
    });
    expect(secret.ok).toBe(true);
    if (!secret.ok) return;

    const valid = await created.value.leaseSecret(scope.value, secret.value, {
      issueLease: () => ({
        version: "1",
        leaseRef: "lease:stripe:42",
        organizationId: "acme",
        projectId: "checkout",
        environment: "production",
        provider: "vault.hashicorp",
        key: "stripe/api-key",
        versionRef: "42",
      }),
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.value.versionRef).toBe("42");
      expect(Object.keys(valid.value)).not.toContain("value");
    }

    const rawSecret = await created.value.leaseSecret(scope.value, secret.value, {
      issueLease: () => ({
        version: "1",
        leaseRef: "lease:stripe:42",
        organizationId: "acme",
        projectId: "checkout",
        environment: "production",
        provider: "vault.hashicorp",
        key: "stripe/api-key",
        versionRef: "42",
        value: "sk-secret",
      }),
    });
    expect(rawSecret.ok).toBe(false);
    if (!rawSecret.ok) expect(rawSecret.issue.code).toBe("INVALID_SECRET_LEASE");
  });
});
