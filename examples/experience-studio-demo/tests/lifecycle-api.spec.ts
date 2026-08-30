import { expect, test } from "@playwright/test";

function document(id: string, text: string) {
  return {
    version: "1",
    id,
    recipeId: "test.recipe.lifecycle-api",
    entryView: "main",
    views: [{
      id: "main",
      nodes: [{
        id: "root",
        component: "airline.component.text",
        order: 0,
        props: { text },
      }],
    }],
    bindings: [],
    interactions: [],
  };
}

test("server owns canonical publication and enforces lifecycle CAS", async ({ request }) => {
  const id = `demo.api-${Date.now()}`;
  const firstDraft = document(id, "Draft one");

  const createdResponse = await request.post("/api/experiences", {
    data: { id, name: "Lifecycle API", document: firstDraft },
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json() as {
    recordVersion: number;
    draftRevision: number;
    publication: unknown;
  };
  expect(created.recordVersion).toBe(1);
  expect(created.draftRevision).toBe(1);
  expect(created.publication).toBeNull();

  const publishedResponse = await request.put(`/api/experiences/${id}/publication`, {
    data: {
      expectedRecordVersion: created.recordVersion,
      publication: { id: "attacker.supplied", manifest: { componentRefs: ["attacker.component"] } },
    },
  });
  expect(publishedResponse.status()).toBe(200);
  const published = await publishedResponse.json() as {
    recordVersion: number;
    draftRevision: number;
    publishedDraftRevision: number;
    publication: {
      id: string;
      document: ReturnType<typeof document>;
      manifest: { componentRefs: string[] };
    };
  };
  expect(published.recordVersion).toBe(2);
  expect(published.draftRevision).toBe(1);
  expect(published.publishedDraftRevision).toBe(1);
  expect(published.publication.id).toBe(id);
  expect(published.publication.document).toEqual(firstDraft);
  expect(published.publication.manifest.componentRefs).toEqual(["airline.component.text"]);

  const staleSaveResponse = await request.put(`/api/experiences/${id}`, {
    data: {
      name: "Lifecycle API stale",
      document: document(id, "Should not win"),
      expectedRecordVersion: 1,
    },
  });
  expect(staleSaveResponse.status()).toBe(409);
  expect(await staleSaveResponse.json()).toMatchObject({ code: "CONFLICT" });

  const secondDraft = document(id, "Draft two");
  const savedResponse = await request.put(`/api/experiences/${id}`, {
    data: {
      name: "Lifecycle API",
      document: secondDraft,
      expectedRecordVersion: published.recordVersion,
    },
  });
  expect(savedResponse.status()).toBe(200);
  const saved = await savedResponse.json() as {
    recordVersion: number;
    draftRevision: number;
    publishedDraftRevision: number;
    publication: { document: ReturnType<typeof document> };
  };
  expect(saved.recordVersion).toBe(3);
  expect(saved.draftRevision).toBe(2);
  expect(saved.publishedDraftRevision).toBe(1);
  expect(saved.publication.document).toEqual(firstDraft);

  const pinnedPublicResponse = await request.get(`/api/publications/${id}`);
  expect(pinnedPublicResponse.status()).toBe(200);
  const pinnedPublic = await pinnedPublicResponse.json() as {
    publication: { document: ReturnType<typeof document> };
  };
  expect(pinnedPublic.publication.document).toEqual(firstDraft);

  const republishedResponse = await request.put(`/api/experiences/${id}/publication`, {
    data: { expectedRecordVersion: saved.recordVersion },
  });
  expect(republishedResponse.status()).toBe(200);
  const republished = await republishedResponse.json() as {
    recordVersion: number;
    publishedDraftRevision: number;
    publication: { document: ReturnType<typeof document> };
  };
  expect(republished.recordVersion).toBe(4);
  expect(republished.publishedDraftRevision).toBe(2);
  expect(republished.publication.document).toEqual(secondDraft);

  const deletedResponse = await request.delete(`/api/experiences/${id}`, {
    data: { expectedRecordVersion: republished.recordVersion },
  });
  expect(deletedResponse.status()).toBe(200);
  expect(await deletedResponse.json()).toEqual({ deleted: true, id });
});
