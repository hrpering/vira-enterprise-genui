import { expect, it } from "vitest";
import {
  createStudioLifecycleService,
  type StudioLifecycleRecord,
  type StudioLifecycleStore,
} from "../src/index.js";

function hostileRecord(): StudioLifecycleRecord {
  return new Proxy({} as StudioLifecycleRecord, {
    get() {
      throw new Error("hostile store getter");
    },
  });
}

function serviceFor(store: StudioLifecycleStore) {
  return createStudioLifecycleService({
    store,
    componentCatalog: {},
    bindingSourceCatalog: {},
    actionAdapter: {},
    nowUnixMs: () => 0,
  });
}

it("collapses hostile read records to STORE_FAILURE", async () => {
  const store: StudioLifecycleStore = {
    async list() { return []; },
    async read() { return hostileRecord(); },
    async listRevisions() { return []; },
    async create() { throw new Error("unused"); },
    async replace() { throw new Error("unused"); },
    async delete() { throw new Error("unused"); },
  };

  const result = await serviceFor(store).read("workspace-a", "demo.hostile");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue).toEqual({
    code: "STORE_FAILURE",
    path: "$.store",
    message: "Studio lifecycle storage operation failed",
  });
});

it("collapses hostile list records to STORE_FAILURE", async () => {
  const store: StudioLifecycleStore = {
    async list() { return [hostileRecord()]; },
    async read() { return undefined; },
    async listRevisions() { return []; },
    async create() { throw new Error("unused"); },
    async replace() { throw new Error("unused"); },
    async delete() { throw new Error("unused"); },
  };

  const result = await serviceFor(store).list("workspace-a");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue.code).toBe("STORE_FAILURE");
});
