import { describe, expect, it } from "vitest";
import {
  createViraDeploymentPlane,
  type ViraSignedExperiencePack,
} from "../../packages/deployment-plane/src/index.js";

const manifestDigest = `sha256:${"d".repeat(64)}`;
const pack: ViraSignedExperiencePack = {
  version: "1",
  manifest: {
    schemaVersion: "1",
    id: "vira/trust",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name: "Trust Pack", tags: ["trust"] },
    compatibility: { minViraVersion: "1.0.0" },
    entrypoints: ["publication"],
    artifacts: [{
      id: "publication",
      role: "studio-publication",
      mediaType: "application/json",
      digest: `sha256:${"e".repeat(64)}`,
      size: 1,
    }],
  },
  manifestDigest,
  signature: {
    algorithm: "ed25519",
    keyId: "key:vira:release",
    value: "abcdefghijklmnop",
  },
};

describe("MASTER-11 promotion trust re-verification", () => {
  it("blocks promotion when a previously valid signature is no longer trusted", async () => {
    let trusted = true;
    const created = createViraDeploymentPlane({
      integrity: {
        digest: () => manifestDigest,
        verifySignature: () => trusted,
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const published = await created.value.publish(pack);
    expect(published.ok).toBe(true);

    trusted = false;
    const promoted = await created.value.promote({
      packId: "vira/trust",
      packVersion: "1.0.0",
      manifestDigest,
      from: "dev",
      to: "staging",
    });
    expect(promoted.ok).toBe(false);
    if (!promoted.ok) expect(promoted.issue.code).toBe("SIGNATURE_INVALID");
    expect(created.value.inspect().deployments.staging).toBeNull();
  });
});
