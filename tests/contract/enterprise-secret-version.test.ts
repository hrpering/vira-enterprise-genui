import { describe, expect, it } from "vitest";
import { createViraEnterpriseContext } from "../../packages/enterprise-context/src/index.js";

describe("MASTER-12 secret lease version identity", () => {
  it("rejects a lease that does not echo the exact SecretRef versionRef", async () => {
    const created = createViraEnterpriseContext({ organizationId: "acme", projectId: "checkout", environments: ["production"] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const scope = created.value.scope("production");
    const secret = created.value.secretRef({
      version: "1",
      organizationId: "acme",
      projectId: "checkout",
      environment: "production",
      provider: "vault.prod",
      key: "payments/api-key",
      versionRef: "42",
    });
    expect(scope.ok && secret.ok).toBe(true);
    if (!scope.ok || !secret.ok) return;

    const missing = await created.value.leaseSecret(scope.value, secret.value, {
      issueLease: () => ({
        version: "1",
        leaseRef: "lease:one",
        organizationId: "acme",
        projectId: "checkout",
        environment: "production",
        provider: "vault.prod",
        key: "payments/api-key",
      }),
    });
    expect(missing.ok).toBe(false);

    const wrong = await created.value.leaseSecret(scope.value, secret.value, {
      issueLease: () => ({
        version: "1",
        leaseRef: "lease:two",
        organizationId: "acme",
        projectId: "checkout",
        environment: "production",
        provider: "vault.prod",
        key: "payments/api-key",
        versionRef: "41",
      }),
    });
    expect(wrong.ok).toBe(false);

    const exact = await created.value.leaseSecret(scope.value, secret.value, {
      issueLease: () => ({
        version: "1",
        leaseRef: "lease:three",
        organizationId: "acme",
        projectId: "checkout",
        environment: "production",
        provider: "vault.prod",
        key: "payments/api-key",
        versionRef: "42",
      }),
    });
    expect(exact.ok).toBe(true);
    if (exact.ok) expect(exact.value.versionRef).toBe("42");
  });
});
