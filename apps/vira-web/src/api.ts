export interface ViraWebScope {
  readonly organizationId: string;
  readonly projectId: string;
  readonly environment: "development" | "staging" | "production";
}

export async function requestVira<T>(path: `/v1/${string}`, scope: ViraWebScope, init: RequestInit = {}): Promise<T> {
  const response = await fetch("/api/bff", {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-vira-target-path": path,
      "x-vira-organization-id": scope.organizationId,
      "x-vira-project-id": scope.projectId,
      "x-vira-environment": scope.environment,
      ...init.headers,
    },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Vira request failed with ${response.status}`);
  return response.json() as Promise<T>;
}
