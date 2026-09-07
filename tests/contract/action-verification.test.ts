import { describe, expect, it } from "vitest";
import {
  createViraActionProviderObservation,
  createViraActionVerificationExpectation,
  evaluateViraActionPostcondition,
  evaluateViraActionPrecondition,
} from "../../packages/action-verification/src/index.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

const BEFORE_DIGEST = "a".repeat(64);
const AFTER_DIGEST = "b".repeat(64);
const BLOB_SHA = "c".repeat(40);

function observation(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    scope,
    providerId: "github",
    connectionId: "github.connection",
    resourceType: "github.repository.file",
    resourceId: "demo/repo:docs/readme.md@main",
    observedAtEpochMs: NOW + 1,
    providerVersion: { kind: "blob-sha", value: BLOB_SHA },
    canonicalDigest: BEFORE_DIGEST,
    data: {
      summary: "before",
      metadata: { revision: 1 },
    },
    ...overrides,
  };
}

function expectation(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    scope,
    transactionId: "transaction.demo.publish",
    planDigest: "d".repeat(64),
    planRevision: 7,
    operationId: "publish.document",
    executionId: "execution.prod13.verify",
    providerId: "github",
    connectionId: "github.connection",
    resourceType: "github.repository.file",
    resourceId: "demo/repo:docs/readme.md@main",
    expectedBefore: {
      providerVersion: { kind: "blob-sha", value: BLOB_SHA },
      canonicalDigest: BEFORE_DIGEST,
    },
    postconditions: [
      { path: "/summary", operator: "equals", value: "after" },
      { path: "/metadata/revision", operator: "equals", value: 2 },
      { path: "/removed", operator: "absent" },
    ],
    strategy: "immediate-readback",
    maxVerificationWindowMs: 60_000,
    ...overrides,
  };
}

describe("PROD-13 action verification contract", () => {
  it("accepts and snapshots an exact secret-free provider observation", () => {
    const mutable = observation();
    const result = createViraActionProviderObservation(mutable);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    (mutable.data as { summary: string }).summary = "attacker";

    expect(result.value.data).toEqual({
      summary: "before",
      metadata: { revision: 1 },
    });
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.data)).toBe(true);
  });

  it("rejects secret-bearing observation data before it can become verification evidence", () => {
    expect(createViraActionProviderObservation(observation({
      data: { summary: "before", access_token: "must-not-enter-evidence" },
    }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_OBSERVATION" },
    });
  });

  it("matches only the exact frozen before-version and before-digest", () => {
    const expected = createViraActionVerificationExpectation(expectation());
    const observed = createViraActionProviderObservation(observation());
    expect(expected.ok).toBe(true);
    expect(observed.ok).toBe(true);
    if (!expected.ok || !observed.ok) return;

    expect(evaluateViraActionPrecondition({
      expectation: expected.value,
      observation: observed.value,
    })).toEqual({
      ok: true,
      value: { status: "match", mismatches: [] },
    });

    const stale = createViraActionProviderObservation(observation({
      providerVersion: { kind: "blob-sha", value: "e".repeat(40) },
      canonicalDigest: "f".repeat(64),
    }));
    expect(stale.ok).toBe(true);
    if (!stale.ok) return;

    expect(evaluateViraActionPrecondition({
      expectation: expected.value,
      observation: stale.value,
    })).toEqual({
      ok: true,
      value: {
        status: "mismatch",
        mismatches: ["provider-version", "canonical-digest"],
      },
    });
  });

  it("classifies unavailable pre-effect reread explicitly instead of permitting dispatch", () => {
    const expected = createViraActionVerificationExpectation(expectation());
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;

    expect(evaluateViraActionPrecondition({ expectation: expected.value })).toEqual({
      ok: true,
      value: { status: "unavailable", mismatches: [] },
    });
  });

  it("rejects cross-tenant or resource-substituted observations as identity attacks", () => {
    const expected = createViraActionVerificationExpectation(expectation());
    const crossTenant = createViraActionProviderObservation(observation({
      scope: { ...scope, projectId: "project-other" },
    }));
    expect(expected.ok).toBe(true);
    expect(crossTenant.ok).toBe(true);
    if (!expected.ok || !crossTenant.ok) return;

    expect(evaluateViraActionPrecondition({
      expectation: expected.value,
      observation: crossTenant.value,
    })).toMatchObject({
      ok: false,
      issue: { code: "OBSERVATION_IDENTITY_MISMATCH" },
    });

    const wrongResource = createViraActionProviderObservation(observation({
      resourceId: "demo/repo:docs/other.md@main",
    }));
    expect(wrongResource.ok).toBe(true);
    if (!wrongResource.ok) return;
    expect(evaluateViraActionPostcondition({
      expectation: expected.value,
      observation: wrongResource.value,
    })).toMatchObject({
      ok: false,
      issue: { code: "OBSERVATION_IDENTITY_MISMATCH" },
    });
  });

  it("derives verified, partial, mismatch and uncertain only from independent observations", () => {
    const expected = createViraActionVerificationExpectation(expectation());
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;

    const verified = createViraActionProviderObservation(observation({
      observedAtEpochMs: NOW + 10,
      providerVersion: { kind: "blob-sha", value: "1".repeat(40) },
      canonicalDigest: AFTER_DIGEST,
      data: { summary: "after", metadata: { revision: 2 } },
    }));
    const partial = createViraActionProviderObservation(observation({
      observedAtEpochMs: NOW + 11,
      providerVersion: { kind: "blob-sha", value: "2".repeat(40) },
      canonicalDigest: AFTER_DIGEST,
      data: { summary: "after", metadata: { revision: 99 }, removed: true },
    }));
    const mismatch = createViraActionProviderObservation(observation({
      observedAtEpochMs: NOW + 12,
      providerVersion: { kind: "blob-sha", value: "3".repeat(40) },
      canonicalDigest: AFTER_DIGEST,
      data: { summary: "wrong", metadata: { revision: 99 }, removed: true },
    }));
    expect(verified.ok && partial.ok && mismatch.ok).toBe(true);
    if (!verified.ok || !partial.ok || !mismatch.ok) return;

    expect(evaluateViraActionPostcondition({ expectation: expected.value, observation: verified.value })).toEqual({
      ok: true,
      value: { status: "verified", matchedAssertions: 3, totalAssertions: 3 },
    });
    expect(evaluateViraActionPostcondition({ expectation: expected.value, observation: partial.value })).toEqual({
      ok: true,
      value: { status: "partial", matchedAssertions: 1, totalAssertions: 3 },
    });
    expect(evaluateViraActionPostcondition({ expectation: expected.value, observation: mismatch.value })).toEqual({
      ok: true,
      value: { status: "mismatch", matchedAssertions: 0, totalAssertions: 3 },
    });
    expect(evaluateViraActionPostcondition({ expectation: expected.value })).toEqual({
      ok: true,
      value: { status: "uncertain", matchedAssertions: 0, totalAssertions: 3 },
    });
  });

  it("rejects duplicated or prototype-sensitive postcondition paths", () => {
    expect(createViraActionVerificationExpectation(expectation({
      postconditions: [
        { path: "/summary", operator: "equals", value: "after" },
        { path: "/summary", operator: "equals", value: "again" },
      ],
    }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EXPECTATION" },
    });

    expect(createViraActionVerificationExpectation(expectation({
      postconditions: [
        { path: "/__proto__/polluted", operator: "equals", value: true },
      ],
    }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EXPECTATION" },
    });
  });
});
