import { test } from "vitest";
import assert from "node:assert/strict";
import { createViraStudioBrandConsole } from "../../packages/studio-brand-console/src/index.js";

test("Studio Brand Console rejects accessor-backed scope without invoking getters", () => {
  let reads = 0;
  const scope = Object.create(null);
  Object.defineProperty(scope, "version", { enumerable: true, get() { reads += 1; return "1"; } });
  Object.defineProperty(scope, "organizationId", { enumerable: true, value: "acme" });
  Object.defineProperty(scope, "projectId", { enumerable: true, value: "travel" });
  Object.defineProperty(scope, "environment", { enumerable: true, value: "dev" });

  const created = createViraStudioBrandConsole({ scope, brandPackage: {} });
  assert.equal(created.ok, false);
  assert.equal(reads, 0);
  if (!created.ok) assert.equal(created.issue.code, "INVALID_SCOPE");
});
