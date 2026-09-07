import { describe, expect, it } from "vitest";
import { decideViraMachineAcquisition, type ViraDelegatedCommercialMandate, type ViraExactCommercialOffer, type ViraExternalPaymentAuthorizationEvidence, type ViraMachineAcquisitionIntent, type ViraNetworkTrustEvidence } from "../../packages/machine-commerce/src/index.js";

const now = 2_000_000_000_000;
const intent: ViraMachineAcquisitionIntent = { version: "1", acquisitionId: "acq:001", idempotencyKey: "idem:001", organizationId: "acme", projectId: "travel", environment: "production", principalKind: "agent", principalId: "agent:buyer", applicationRef: "application:travel@2.0.0", capabilityRef: "capability:book@1.0.0", offerRef: "offer:001@1", mandateRef: "mandate:001@1", operationClass: "action", actionBoundaryEvidenceRef: "evidence:action-boundary:001" };
const trust: ViraNetworkTrustEvidence = { version: "1", evidenceId: "trust:001", issuerId: "issuer:network", subjectRef: intent.offerRef, verifierId: "verifier:vira", issuedAtEpochMs: now - 1_000, expiresAtEpochMs: now + 60_000, keyId: "key:001", attestationDigest: `sha256:${"a".repeat(64)}`, result: "verified", revokedAtEpochMs: null };
const offer: ViraExactCommercialOffer = { version: "1", offerRef: intent.offerRef, sellerId: "seller:publisher", providerId: "provider:github", organizationId: intent.organizationId, applicationRef: intent.applicationRef, capabilityRef: intent.capabilityRef, bindingRef: "binding:github@1", locationId: "eu-west", planRef: "plan:standard@1", settlementRef: "settlement:standard@1", currency: "USD", amountNanos: "5000000000", validFromEpochMs: now - 1_000, expiresAtEpochMs: now + 60_000, trustEvidenceId: trust.evidenceId };
const mandate: ViraDelegatedCommercialMandate = { version: "1", mandateRef: intent.mandateRef, principalKind: intent.principalKind, principalId: intent.principalId, organizationId: intent.organizationId, projectId: intent.projectId, environment: intent.environment, applicationRef: intent.applicationRef, capabilityRef: intent.capabilityRef, allowedSellerIds: [offer.sellerId], allowedProviderIds: [offer.providerId], allowedCurrencies: [offer.currency], perAcquisitionLimitNanos: "6000000000", cumulativeLimitNanos: "10000000000", spentNanos: "1000000000", validFromEpochMs: now - 1_000, expiresAtEpochMs: now + 60_000, revokedAtEpochMs: null, humanChallengeRequired: false };
const payment: ViraExternalPaymentAuthorizationEvidence = { version: "1", evidenceRef: "payment-auth:001", adapterId: "adapter:stripe", providerId: "payments:external", acquisitionId: intent.acquisitionId, amountNanos: offer.amountNanos, currency: offer.currency, outcome: "authorized", expiresAtEpochMs: now + 30_000 };
const accept = { accept: () => true };
function decide(overrides: Partial<{ intent: ViraMachineAcquisitionIntent; offer: ViraExactCommercialOffer; mandate: ViraDelegatedCommercialMandate; trust: ViraNetworkTrustEvidence; payment: ViraExternalPaymentAuthorizationEvidence | null; replayGuard: typeof accept }> = {}) { return decideViraMachineAcquisition({ intent, offer, mandate, trust, payment, nowEpochMs: now, replayGuard: accept, ...overrides }); }

describe("PROD-20 machine commerce", () => {
  it("selects deterministically with exact trust, offer, mandate, Action Boundary and external payment evidence", async () => {
    const first = await decide(); const second = await decide();
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, value: { outcome: "selected", entitlementProvisioning: "eligible", fundsMovement: "external-only", paymentAuthorizationEvidenceRef: payment.evidenceRef } });
  });

  it("returns only deterministic declined and challenge-required alternatives", async () => {
    expect(await decide({ mandate: { ...mandate, allowedProviderIds: ["provider:other"] } })).toMatchObject({ ok: true, value: { outcome: "declined", entitlementProvisioning: "forbidden" } });
    expect(await decide({ mandate: { ...mandate, humanChallengeRequired: true } })).toMatchObject({ ok: true, value: { outcome: "challenge-required", entitlementProvisioning: "forbidden" } });
  });

  it.each([
    ["expired trust", { trust: { ...trust, expiresAtEpochMs: now } }, "TRUST_EXPIRED"],
    ["revoked trust", { trust: { ...trust, revokedAtEpochMs: now - 1 } }, "TRUST_REVOKED"],
    ["expired offer", { offer: { ...offer, expiresAtEpochMs: now } }, "OFFER_EXPIRED"],
    ["revoked mandate", { mandate: { ...mandate, revokedAtEpochMs: now - 1 } }, "MANDATE_REVOKED"],
    ["mandate overflow", { mandate: { ...mandate, spentNanos: "9000000000" } }, "MANDATE_OVERFLOW"],
    ["cross organization", { intent: { ...intent, organizationId: "evil" } }, "CROSS_ORGANIZATION"],
    ["currency mismatch", { payment: { ...payment, currency: "EUR" } }, "CURRENCY_MISMATCH"],
    ["protected action bypass", { intent: { ...intent, actionBoundaryEvidenceRef: null } }, "PROTECTED_ACTION_BYPASS"],
  ] as const)("fails closed for %s", async (_name, overrides, code) => {
    expect(await decide(overrides)).toMatchObject({ ok: false, issue: { code } });
  });

  it("rejects replay and replay-guard outages", async () => {
    expect(await decide({ replayGuard: { accept: () => false } })).toMatchObject({ ok: false, issue: { code: "REPLAY_REJECTED" } });
    expect(await decide({ replayGuard: { accept: () => { throw new Error("offline"); } } })).toMatchObject({ ok: false, issue: { code: "REPLAY_GUARD_FAILED" } });
  });

  it("rejects unknown fields before touching replay state", async () => {
    let replayCalls = 0;
    const forgedOffer = { ...offer, paymentToken: "smuggled" } as ViraExactCommercialOffer;
    expect(await decide({ offer: forgedOffer, replayGuard: { accept: () => { replayCalls += 1; return true; } } })).toMatchObject({ ok: false, issue: { code: "INVALID_OFFER" } });
    expect(replayCalls).toBe(0);
  });

  it("does not expose a funds movement operation", async () => {
    expect(Object.keys(await import("../../packages/machine-commerce/src/index.js"))).not.toContain("capturePayment");
  });
});
