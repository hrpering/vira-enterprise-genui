import type { StudioPublication } from "@vira-enterprise-genui/studio-compiler";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";

export interface ExperienceSummary {
  readonly id: string;
  readonly name: string;
  readonly published: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface ExperienceRecord {
  readonly id: string;
  readonly name: string;
  readonly document: StudioExperienceDocument;
  readonly publication: StudioPublication | null;
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
  return value.experiences;
}

export function readExperience(id: string): Promise<ExperienceRecord> {
  return requestJson(`/api/experiences/${encodeURIComponent(id)}`);
}

export function createExperience(input: {
  readonly id: string;
  readonly name: string;
  readonly document: StudioExperienceDocument;
}): Promise<ExperienceRecord> {
  return requestJson("/api/experiences", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function saveExperienceDraft(
  id: string,
  name: string,
  document: StudioExperienceDocument,
): Promise<ExperienceRecord> {
  return requestJson(`/api/experiences/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ name, document }),
  });
}

export function publishExperience(id: string, publication: StudioPublication): Promise<ExperienceRecord> {
  return requestJson(`/api/experiences/${encodeURIComponent(id)}/publication`, {
    method: "PUT",
    body: JSON.stringify({ publication }),
  });
}

export function unpublishExperience(id: string): Promise<ExperienceRecord> {
  return requestJson(`/api/experiences/${encodeURIComponent(id)}/publication`, { method: "DELETE" });
}

export function deleteExperience(id: string): Promise<{ readonly deleted: true; readonly id: string }> {
  return requestJson(`/api/experiences/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function readPublicExperience(id: string): Promise<PublicExperience> {
  return requestJson(`/api/publications/${encodeURIComponent(id)}`);
}
