import { describe, expect, it } from "vitest";
import { createViraActionProviderObservation } from "../../packages/action-verification/src/index.js";
import type { ViraDurableExecutionStageBPermit } from "../../packages/durable-execution/src/index.js";
import {
  runViraPrivateObservation,
  type ViraPrivateObservationAuthority,
} from "../../packages/private-runner/src/observation.js";
import { runViraPrivateExecution } from "../../packages/private-runner/src/index.js";
import {
  createGitHubFileObservationAdapter,
  createGitHubFileWriteAdapter,
  githubFileResourceIdFromIntent,
} from "../../integrations/private-runner/github-file-action-adapter.js";
import {
  createGoogleCalendarObservationAdapter,
  createGoogleCalendarWriteAdapter,
  googleCalendarResourceIdFromIntent,
} from "../../integrations/private-runner/google-calendar-action-adapter.js";
import type {
  ViraPrivateProviderHttpRequest,
  ViraPrivateProviderHttpResponse,
  ViraPrivateProviderHttpTransport,
} from "../../integrations/private-runner/provider-http.js";
import { NOW, scope } from "../contract/prod11-transaction-fixture.js";

const SECRET = "prod13-provider-secret-0123456789";
const SECRET_REF = Object.freeze({
  version: "1" as const,
  organizationId: scope.organizationId,
  projectId: scope.projectId,
  environment: scope.environment,
  provider: "vault",
  key: "providers.reference",
  versionRef: "1",
});

function secretProvider(expiresAtEpochMs = NOW + 90_000) {
  return {
    resolve() {
      return { scope, secretRef: SECRET_REF, credential: SECRET, expiresAtEpochMs };
    },
  };
}

function githubIntent() {
  return Object.freeze({
    version: "1" as const,
    kind: "github.repository.file.update" as const,
    owner: "demo-owner",
    repo: "demo-repo",
    path: "docs/readme.md",
    branch: "main",
    message: "Update readme",
    contentBase64: Buffer.from("new content", "utf8").toString("base64"),
  });
}

function googleIntent() {
  return Object.freeze({
    version: "1" as const,
    kind: "google.workspace.calendar.event.update" as const,
    calendarId: "primary@example.com",
    eventId: "event123",
    event: Object.freeze({
      id: "event123",
      summary: "Updated title",
      start: { dateTime: "2026-09-08T10:00:00+03:00" },
      end: { dateTime: "2026-09-08T11:00:00+03:00" },
    }),
  });
}

function permit(provider: "github" | "google.workspace", actionIntent: object): ViraDurableExecutionStageBPermit {
  return {
    version: "1",
    executionId: `execution.prod13.${provider === "github" ? "github" : "google"}`,
    scope,
    transactionId: "transaction.prod13.reference-write",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "provider.reference.update",
    actionRef: { id: provider === "github" ? "github.repository.file.update" : "google.workspace.calendar.event.update", versionRef: "1.0.0" },
    actionIntent: actionIntent as ViraDurableExecutionStageBPermit["actionIntent"],
    providerId: provider,
    connectionId: provider === "github" ? "github.connection" : "google.workspace.connection",
    adapterRef: provider === "github" ? "adapter.github.contents" : "adapter.google.calendar",
    runnerRef: "runner.private",
    secretRef: SECRET_REF,
    idempotencyKey: `prod13:${provider}:reference-write`,
    grantId: `grant.prod13.${provider}`,
    grantNonce: `nonce.prod13.${provider}`,
    reservationId: `reservation.prod13.${provider}`,
    reservationRevision: 4,
    workerId: "worker.prod13.a",
    leaseEpoch: 1,
    expiresAtEpochMs: NOW + 10_000,
  };
}

function observationAuthority(provider: "github" | "google.workspace", actionIntent: object): ViraPrivateObservationAuthority {
  return {
    version: "1",
    authorityId: `verification.prod13.${provider}`,
    scope,
    providerId: provider,
    connectionId: provider === "github" ? "github.connection" : "google.workspace.connection",
    actionIntent: actionIntent as ViraPrivateObservationAuthority["actionIntent"],
    secretRef: SECRET_REF,
    expiresAtEpochMs: NOW + 120_000,
  };
}

function queuedHttp(responses: readonly ViraPrivateProviderHttpResponse[]) {
  const requests: ViraPrivateProviderHttpRequest[] = [];
  let index = 0;
  const http: ViraPrivateProviderHttpTransport = {
    async request(input) {
      requests.push(input);
      const response = responses[index++];
      if (response === undefined) throw new Error("unexpected provider HTTP request");
      return response;
    },
  };
  return { http, requests };
}

function observationFromPrivate(result: Awaited<ReturnType<typeof runViraPrivateObservation>>) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.issue.code);
  const parsed = createViraActionProviderObservation(result.value.data.observation);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.issue.code);
  return parsed.value;
}

describe("PROD-13 credential-bearing reference provider adapters", () => {
  it("GitHub independently reads blob SHA and uses that exact SHA for the conditional PUT", async () => {
    const oldSha = "1".repeat(40);
    const intent = githubIntent();
    const { http, requests } = queuedHttp([
      {
        status: 200,
        body: {
          type: "file",
          sha: oldSha,
          path: intent.path,
          encoding: "base64",
          content: Buffer.from("old content", "utf8").toString("base64"),
        },
      },
      { status: 200, body: { content: { sha: "2".repeat(40) }, commit: { sha: "3".repeat(40) } } },
    ]);

    const before = observationFromPrivate(await runViraPrivateObservation({
      authority: observationAuthority("github", intent),
      nowEpochMs: NOW + 1,
      secretProvider: secretProvider(),
      adapter: createGitHubFileObservationAdapter({ http, now: () => NOW + 2 }),
    }));
    expect(before.providerVersion).toEqual({ kind: "blob-sha", value: oldSha });
    expect(before.resourceId).toBe(githubFileResourceIdFromIntent(intent));

    const write = await runViraPrivateExecution({
      permit: permit("github", intent),
      nowEpochMs: NOW + 3,
      secretProvider: secretProvider(NOW + 9_000),
      adapter: createGitHubFileWriteAdapter({ http, expectedBlobSha: before.providerVersion.value }),
    });
    expect(write).toMatchObject({ ok: true, value: { dispatch: "accepted" } });
    expect(requests).toHaveLength(2);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[1]!.method).toBe("PUT");
    expect(requests[1]!.headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(requests[1]!.body ?? "{}")).toMatchObject({ sha: oldSha, branch: "main" });
    expect(JSON.stringify(write)).not.toContain(SECRET);
  });

  it("GitHub 409 is an explicit known rejection and never becomes verified evidence", async () => {
    const { http } = queuedHttp([{ status: 409, body: { message: "conflict" } }]);
    const result = await runViraPrivateExecution({
      permit: permit("github", githubIntent()),
      nowEpochMs: NOW + 1,
      secretProvider: secretProvider(NOW + 9_000),
      adapter: createGitHubFileWriteAdapter({ http, expectedBlobSha: "4".repeat(40) }),
    });
    expect(result).toMatchObject({
      ok: true,
      value: { dispatch: "rejected", data: { code: "precondition-conflict", providerStatus: 409 } },
    });
  });

  it("Google independently reads ETag and sends it only in If-Match for the conditional update", async () => {
    const intent = googleIntent();
    const etag = '"etag-before"';
    const { http, requests } = queuedHttp([
      { status: 200, body: { ...intent.event, etag, status: "confirmed" } },
      { status: 200, body: { ...intent.event, etag: '"etag-after"' } },
    ]);

    const before = observationFromPrivate(await runViraPrivateObservation({
      authority: observationAuthority("google.workspace", intent),
      nowEpochMs: NOW + 1,
      secretProvider: secretProvider(),
      adapter: createGoogleCalendarObservationAdapter({ http, now: () => NOW + 2 }),
    }));
    expect(before.providerVersion).toEqual({ kind: "etag", value: etag });
    expect(before.resourceId).toBe(googleCalendarResourceIdFromIntent(intent));

    const write = await runViraPrivateExecution({
      permit: permit("google.workspace", intent),
      nowEpochMs: NOW + 3,
      secretProvider: secretProvider(NOW + 9_000),
      adapter: createGoogleCalendarWriteAdapter({ http, expectedEtag: before.providerVersion.value }),
    });
    expect(write).toMatchObject({ ok: true, value: { dispatch: "accepted" } });
    expect(requests[1]!.headers["If-Match"]).toBe(etag);
    expect(requests[1]!.headers.Authorization).toBe(`Bearer ${SECRET}`);
  });

  it("Google 412 is a precondition conflict and readback authority can outlive the effect permit", async () => {
    const intent = googleIntent();
    const { http } = queuedHttp([
      { status: 200, body: { ...intent.event, etag: '"post-effect-etag"' } },
      { status: 412, body: { error: { code: 412 } } },
    ]);

    const postRead = await runViraPrivateObservation({
      authority: observationAuthority("google.workspace", intent),
      nowEpochMs: NOW + 20_000,
      secretProvider: secretProvider(NOW + 90_000),
      adapter: createGoogleCalendarObservationAdapter({ http, now: () => NOW + 20_001 }),
    });
    expect(postRead.ok).toBe(true);
    expect(permit("google.workspace", intent).expiresAtEpochMs).toBeLessThan(NOW + 20_000);

    const conflict = await runViraPrivateExecution({
      permit: permit("google.workspace", intent),
      nowEpochMs: NOW + 1,
      secretProvider: secretProvider(NOW + 9_000),
      adapter: createGoogleCalendarWriteAdapter({ http, expectedEtag: '"stale-etag"' }),
    });
    expect(conflict).toMatchObject({
      ok: true,
      value: { dispatch: "rejected", data: { code: "precondition-conflict", providerStatus: 412 } },
    });
  });
});
