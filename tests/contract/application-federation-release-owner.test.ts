import { describe, expect, it } from "vitest";
import {
  lookupViraFederatedApplication,
} from "../../packages/application-federation/src/index.js";
import {
  parseViraApplicationReleaseReference,
} from "../../packages/application-package/src/index.js";

const EMPTY_SNAPSHOT = Object.freeze({ schemaVersion: "1", sources: Object.freeze([]) });

function lookup(id: unknown, version: unknown) {
  return lookupViraFederatedApplication(EMPTY_SNAPSHOT, {
    applicationId: id,
    applicationVersion: version,
  });
}

describe("MASTER-48 federation Application release owner parity", () => {
  it("accepts every representative exact release accepted by the canonical owner", () => {
    for (const reference of [
      { id: "acme.publisher-proof", version: "0.0.0" },
      { id: "acme.publisher-proof", version: "1.2.3" },
      { id: "acme.publisher-proof", version: "999999999999999999999999.0.1" },
    ]) {
      expect(parseViraApplicationReleaseReference(reference).ok).toBe(true);
      const result = lookup(reference.id, reference.version);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.applicationId).toBe(reference.id);
        expect(result.value.applicationVersion).toBe(reference.version);
        expect(result.value.envelope).toBeNull();
      }
    }
  });

  it("maps canonical release-owner rejection to INVALID_QUERY without inventing fallback semantics", () => {
    for (const reference of [
      { id: "acme", version: "1.0.0" },
      { id: "Acme.publisher-proof", version: "1.0.0" },
      { id: "acme.publisher-proof", version: "latest" },
      { id: "acme.publisher-proof", version: "1" },
      { id: "acme.publisher-proof", version: "01.0.0" },
      { id: "acme.publisher-proof", version: "1.0.0-beta" },
    ]) {
      expect(parseViraApplicationReleaseReference(reference).ok).toBe(false);
      expect(lookup(reference.id, reference.version)).toMatchObject({
        ok: false,
        issue: { code: "INVALID_QUERY" },
      });
    }
  });

  it("keeps federation query shape strict before delegating release semantics", () => {
    expect(lookupViraFederatedApplication(EMPTY_SNAPSHOT, {
      applicationId: "acme.publisher-proof",
      applicationVersion: "1.0.0",
      latest: true,
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUERY", path: "$query.latest" },
    });
  });
});
