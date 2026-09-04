import { describe, expect, it, vi } from "vitest";
import { ViraBrandClient, VIRA_EXTERNAL_BRAND_SDK_VERSION } from "../../packages/external-brand-sdk/src/index.js";

describe("MASTER-20 external brand SDK", () => {
  it("uses only the injected server transport and freezes the request", async () => {
    const request = vi.fn(async (input: unknown) => {
      expect(Object.isFrozen(input)).toBe(true);
      return { version: "1", experience: { id: "exp.checkout" } };
    });
    const client = ViraBrandClient.create({ request });
    const output = await client.experience({
      version: VIRA_EXTERNAL_BRAND_SDK_VERSION,
      experienceId: "exp.checkout",
      environment: "production",
    });
    expect(request).toHaveBeenCalledOnce();
    expect(output).toEqual({ version: "1", experience: { id: "exp.checkout" } });
    expect(Object.isFrozen(output)).toBe(true);
  });

  it("rejects unknown response fields instead of accepting registry-specific leakage", async () => {
    const client = ViraBrandClient.create({
      request: async () => ({ version: "1", experience: {}, registryInternal: "leak" }),
    });
    await expect(client.experience({
      version: "1",
      experienceId: "exp.checkout",
      environment: "dev",
    })).rejects.toThrow("invalid Vira brand response");
  });

  it("rejects malformed customer request identities before transport", async () => {
    const request = vi.fn(async () => ({ version: "1", experience: {} }));
    const client = ViraBrandClient.create({ request });
    await expect(client.experience({
      version: "1",
      experienceId: " bad ",
      environment: "dev",
    })).rejects.toThrow("invalid Vira brand request identity");
    expect(request).not.toHaveBeenCalled();
  });
});
