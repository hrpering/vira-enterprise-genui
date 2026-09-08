import { describe, expect, it } from "vitest";
import { VIRA_FULL_PLATFORM_STAGES, proveViraFullPlatform, type ViraFullPlatformProofInput } from "./proof.js";

const digest = `sha256:${"a".repeat(64)}`;
const base: ViraFullPlatformProofInput = {
  version: "1", applicationRef: "application:travel@2.0.0", capabilityRef: "capability:book@1.0.0", tenantRef: "tenant:acme/travel/production",
  publisherRef: "publisher:external@1", externalHostRef: "host:external-ai@1", initialDeviceRef: "device:ios@1", continuationDeviceRef: "device:android@1",
  currentPlatformVersion: "2.1.0", minimumPlatformVersion: "2.0.0", maximumPlatformVersion: "3.0.0", currency: "USD", amountNanos: "5000000000",
  revokedRefs: [], loadIterations: 1_000, soakDurationMs: 60_000, restoredSnapshotDigest: digest, expectedSnapshotDigest: digest,
  stages: VIRA_FULL_PLATFORM_STAGES.map((stage, index) => ({ stage, evidenceRef: `evidence:${index + 1}@1`, applicationRef: "application:travel@2.0.0", capabilityRef: "capability:book@1.0.0", tenantRef: "tenant:acme/travel/production", outcome: "verified" as const })),
};
const prove = (overrides: Partial<ViraFullPlatformProofInput> = {}) => proveViraFullPlatform({ ...base, ...overrides });

describe("PROD-22 full-platform provisional gate", () => {
  it("binds the entire external publisher to reconciliation chain deterministically", () => {
    const first = prove(); const second = prove();
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, value: { status: "PROVISIONAL_CODE_COMPLETE", liveReleaseGates: "OPEN", releaseAuthority: "forbidden", crossDeviceContinuation: "verified", upgradeCompatibility: "verified", loadSoak: "simulated-verified", disasterRecovery: "simulated-verified" } });
  });

  it.each([
    ["upgrade", { currentPlatformVersion: "4.0.0" }, "UPGRADE_INCOMPATIBLE"],
    ["revocation", { revokedRefs: [base.externalHostRef] }, "REVOKED_IDENTITY"],
    ["cross-device", { continuationDeviceRef: base.initialDeviceRef }, "CROSS_DEVICE_HANDOFF_MISSING"],
    ["load", { loadIterations: 999 }, "LOAD_SOAK_INCOMPLETE"],
    ["soak", { soakDurationMs: 59_999 }, "LOAD_SOAK_INCOMPLETE"],
    ["DR", { restoredSnapshotDigest: `sha256:${"b".repeat(64)}` }, "RESTORE_MISMATCH"],
  ] as const)("fails closed for %s gate drift", (_name, overrides, code) => expect(prove(overrides)).toMatchObject({ ok: false, issue: { code } }));

  it("rejects exact-reference drift and incomplete stage order", () => {
    const drift = base.stages.map((stage, index) => index === 8 ? { ...stage, applicationRef: "application:other@1" } : stage);
    expect(prove({ stages: drift })).toMatchObject({ ok: false, issue: { code: "EXACT_REFERENCE_MISMATCH" } });
    expect(prove({ stages: base.stages.slice(1) })).toMatchObject({ ok: false, issue: { code: "INCOMPLETE_CHAIN" } });
  });

  it("rejects untrusted extra fields", () => {
    expect(proveViraFullPlatform({ ...base, release: true } as ViraFullPlatformProofInput)).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });
  });

  it.each(["upgrade-incompatible", "revoked-supply", "handoff-gap", "load-failure", "soak-failure", "restore-mismatch"] as const)("rejects simulated %s", (simulatedFault) => expect(prove({ simulatedFault })).toMatchObject({ ok: false, issue: { code: "SIMULATED_FAULT_REJECTED" } }));
});
