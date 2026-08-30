import type { StudioPublication } from "@vira-enterprise-genui/studio-compiler";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import { applyMockDomainBindings } from "./mock-bindings.js";

export interface ExperienceSummary {
  readonly workspaceId: string;
  readonly id: string;
  readonly name: string;
  readonly draftRevision: number;
  readonly recordVersion: number;
  readonly published: boolean;
  readonly publishedDraftRevision: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface ExperienceRecord {
  readonly version: "1";
  readonly workspaceId: string;
  readonly id: string;
  readonly name: string;
  readonly draftRevision: number;
  readonly recordVersion: number;
  readonly document: StudioExperienceDocument;
  readonly publication: StudioPublication | null;
  readonly publishedDraftRevision: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface PublicExperience {
  readonly id: string;
  readonly name: string;
  readonly publication: StudioPublication;
  readonly publishedAt: string;
}

const recordVersions = new Map<string, number>();
const mutationQueues = new Map<string, Promise<void>>();

function rememberRecord(record: ExperienceRecord): ExperienceRecord {
  recordVersions.set(record.id, record.recordVersion);
  return record;
}

function expectedRecordVersion(id: string): number {
  const version = recordVersions.get(id);
  if (version === undefined) throw new Error("Studio lifecycle version is unavailable; reload the experience before changing it");
  return version;
}

function enqueueMutation<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const previous = mutationQueues.get(id) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  mutationQueues.set(id, current.then(() => undefined, () => undefined));
  return current;
}

async function waitForMutationQuiescence(id: string): Promise<void> {
  while (true) {
    const observed = mutationQueues.get(id);
    if (observed) await observed.catch(() => undefined);
    await Promise.resolve();
    if (mutationQueues.get(id) === observed) return;
  }
}

async function readQuiescentExperience(id: string): Promise<ExperienceRecord> {
  while (true) {
    await waitForMutationQuiescence(id);
    const observed = mutationQueues.get(id);
    const record = await readExperience(id);
    await waitForMutationQuiescence(id);
    if (mutationQueues.get(id) === observed) return record;
  }
}

function sameDocument(left: StudioExperienceDocument, right: StudioExperienceDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(url, { ...init, headers });
  const body = await response.json() as unknown;
  if (!response.ok) {
    const message = body !== null
      && typeof body === "object"
      && !Array.isArray(body)
      && "error" in body
      && typeof body.error === "string"
      ? body.error
      : `request failed with ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export async function listExperiences(): Promise<readonly ExperienceSummary[]> {
  const value = await requestJson<{ readonly experiences: readonly ExperienceSummary[] }>("/api/experiences");
  for (const summary of value.experiences) recordVersions.set(summary.id, summary.recordVersion);
  return value.experiences;
}

export async function readExperience(id: string): Promise<ExperienceRecord> {
  return rememberRecord(await requestJson<ExperienceRecord>(`/api/experiences/${encodeURIComponent(id)}`));
}

export async function createExperience(input: {
  readonly id: string;
  readonly name: string;
  readonly document: StudioExperienceDocument;
}): Promise<ExperienceRecord> {
  const document = applyMockDomainBindings(input.document);
  return rememberRecord(await requestJson<ExperienceRecord>("/api/experiences", {
    method: "POST",
    body: JSON.stringify({ ...input, document }),
  }));
}

export function saveExperienceDraft(
  id: string,
  name: string,
  document: StudioExperienceDocument,
): Promise<ExperienceRecord> {
  return enqueueMutation(id, async () => rememberRecord(await requestJson<ExperienceRecord>(`/api/experiences/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ name, document, expectedRecordVersion: expectedRecordVersion(id) }),
  })));
}

export async function publishExperience(id: string, publication: StudioPublication): Promise<ExperienceRecord> {
  const current = await readQuiescentExperience(id);
  if (!sameDocument(current.document, publication.document)) {
    throw new Error("Studio draft changed while Publish was waiting for autosave; review the latest draft and publish again");
  }
  return enqueueMutation(id, async () => rememberRecord(await requestJson<ExperienceRecord>(`/api/experiences/${encodeURIComponent(id)}/publication`, {
    method: "PUT",
    body: JSON.stringify({ expectedRecordVersion: current.recordVersion }),
  })));
}

export async function unpublishExperience(id: string): Promise<ExperienceRecord> {
  await waitForMutationQuiescence(id);
  return enqueueMutation(id, async () => rememberRecord(await requestJson<ExperienceRecord>(`/api/experiences/${encodeURIComponent(id)}/publication`, {
    method: "DELETE",
    body: JSON.stringify({ expectedRecordVersion: expectedRecordVersion(id) }),
  })));
}

export async function deleteExperience(id: string): Promise<{ readonly deleted: true; readonly id: string }> {
  await waitForMutationQuiescence(id);
  return enqueueMutation(id, async () => {
    const result = await requestJson<{ readonly deleted: true; readonly id: string }>(`/api/experiences/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify({ expectedRecordVersion: expectedRecordVersion(id) }),
    });
    recordVersions.delete(id);
    return result;
  });
}

export function readPublicExperience(id: string): Promise<PublicExperience> {
  return requestJson(`/api/publications/${encodeURIComponent(id)}`);
}
