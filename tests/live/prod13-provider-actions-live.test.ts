import { describe, expect, it } from "vitest";
import { createViraActionProviderObservation } from "../../packages/action-verification/src/index.js";
import type { ViraDurableExecutionStageBPermit } from "../../packages/durable-execution/src/index.js";
import type { ViraEnterpriseScope, ViraSecretRef } from "../../packages/enterprise-context/src/index.js";
import {
  runViraPrivateObservation,
  type ViraPrivateObservationAuthority,
} from "../../packages/private-runner/src/observation.js";
import { runViraPrivateExecution } from "../../packages/private-runner/src/index.js";
import {
  createGitHubFileObservationAdapter,
  createGitHubFileWriteAdapter,
} from "../../integrations/private-runner/github-file-action-adapter.js";
import {
  createGoogleCalendarObservationAdapter,
  createGoogleCalendarWriteAdapter,
} from "../../integrations/private-runner/google-calendar-action-adapter.js";
import { createFetchPrivateProviderHttpTransport } from "../../integrations/private-runner/provider-http.js";
import type { JsonObject } from "../../packages/protocol/src/index.js";

const ENABLED = process.env.VIRA_PROD13_LIVE_PROVIDER_ENABLED === "1";

function required(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} is required`);
  return value.trim();
}

function jsonObject(name: string): JsonObject {
  const raw = required(name);
  const parsed = JSON.parse(raw) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${name} must be a JSON object`);
  return parsed as JsonObject;
}

const scope: ViraEnterpriseScope = Object.freeze({
  version: "1",
  organizationId: "prod13-live-proof",
  projectId: "provider-canary",
  environment: "staging",
});

function secretRef(provider: string): ViraSecretRef {
  return Object.freeze({
    version: "1",
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    environment: scope.environment,
    provider: "live-proof",
    key: provider,
    versionRef: "operator-supplied",
  });
}

function secretProvider(ref: ViraSecretRef, credential: string, now: number) {
  return Object.freeze({
    resolve() {
      return Object.freeze({ scope, secretRef: ref, credential, expiresAtEpochMs: now + 10 * 60_000 });
    },
  });
}

function permit(input: {
  providerId: "github" | "google.workspace";
  connectionId: string;
  actionId: string;
  actionIntent: JsonObject;
  ref: ViraSecretRef;
  now: number;
}): ViraDurableExecutionStageBPermit {
  const suffix = input.providerId === "github" ? "github" : "google";
  return Object.freeze({
    version: "1",
    executionId: `execution.prod13.live.${suffix}`,
    scope,
    transactionId: `transaction.prod13.live.${suffix}`,
    planDigest: suffix === "github" ? "a".repeat(64) : "b".repeat(64),
    planRevision: 1,
    operationId: input.actionId,
    actionRef: Object.freeze({ id: input.actionId, versionRef: "1.0.0" }),
    actionIntent: input.actionIntent,
    providerId: input.providerId,
    connectionId: input.connectionId,
    adapterRef: `adapter.${suffix}.live-proof`,
    runnerRef: "runner.private.live-proof",
    secretRef: input.ref,
    idempotencyKey: `prod13-live-proof:${suffix}:${input.now}`,
    grantId: `grant.prod13.live.${suffix}`,
    grantNonce: `nonce.prod13.live.${suffix}.${input.now}`,
    reservationId: `reservation.prod13.live.${suffix}.${input.now}`,
    reservationRevision: 1,
    workerId: "worker.prod13.live-proof",
    leaseEpoch: 1,
    expiresAtEpochMs: input.now + 5 * 60_000,
  });
}

function authority(input: {
  providerId: "github" | "google.workspace";
  connectionId: string;
  actionIntent: JsonObject;
  ref: ViraSecretRef;
  now: number;
}): ViraPrivateObservationAuthority {
  return Object.freeze({
    version: "1",
    authorityId: `verification.prod13.live.${input.providerId}.${input.now}`,
    scope,
    providerId: input.providerId,
    connectionId: input.connectionId,
    actionIntent: input.actionIntent,
    secretRef: input.ref,
    expiresAtEpochMs: input.now + 10 * 60_000,
  });
}

function observationFromPrivate(result: Awaited<ReturnType<typeof runViraPrivateObservation>>) {
  if (!result.ok) throw new Error(`private provider observation failed: ${result.issue.code}`);
  const parsed = createViraActionProviderObservation(result.value.data.observation);
  if (!parsed.ok) throw new Error(`provider observation was not canonical: ${parsed.issue.code}`);
  return parsed.value;
}

function fetchTransport() {
  return createFetchPrivateProviderHttpTransport(fetch);
}

function changedText(original: string, marker: string): string {
  return `${original}${original.endsWith("\n") || original.length === 0 ? "" : "\n"}${marker}\n`;
}

function githubIntent(input: {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  message: string;
  contentBase64: string;
}): JsonObject {
  return Object.freeze({
    version: "1",
    kind: "github.repository.file.update",
    owner: input.owner,
    repo: input.repo,
    path: input.path,
    branch: input.branch,
    message: input.message,
    contentBase64: input.contentBase64,
  });
}

function googleIntent(calendarId: string, eventId: string, event: JsonObject): JsonObject {
  return Object.freeze({
    version: "1",
    kind: "google.workspace.calendar.event.update",
    calendarId,
    eventId,
    event,
  });
}

describe.runIf(ENABLED)("PROD-13 real provider protected Action proof", () => {
  it("performs and restores a real GitHub conditional file update with independent rereads", async () => {
    const token = required("VIRA_PROD13_GITHUB_TOKEN");
    const owner = required("VIRA_PROD13_GITHUB_OWNER");
    const repo = required("VIRA_PROD13_GITHUB_REPO");
    const path = required("VIRA_PROD13_GITHUB_PATH");
    const branch = required("VIRA_PROD13_GITHUB_BRANCH");
    const now = Date.now();
    const marker = `VIRA_PROD13_LIVE_PROOF_${now}`;
    const ref = secretRef("github");
    const http = fetchTransport();
    const initialIntent = githubIntent({ owner, repo, path, branch, message: marker, contentBase64: Buffer.from("placeholder").toString("base64") });
    const obsAdapter = createGitHubFileObservationAdapter({ http, now: () => Date.now() });

    const before = observationFromPrivate(await runViraPrivateObservation({
      authority: authority({ providerId: "github", connectionId: "github.live-proof", actionIntent: initialIntent, ref, now }),
      nowEpochMs: Date.now(),
      secretProvider: secretProvider(ref, token, now),
      adapter: obsAdapter,
    }));

    const originalBase64 = String(before.data.contentBase64 ?? "");
    const originalBytes = Buffer.from(originalBase64, "base64");
    const originalText = originalBytes.toString("utf8");
    expect(Buffer.from(originalText, "utf8").equals(originalBytes)).toBe(true);
    const changedBase64 = Buffer.from(changedText(originalText, marker), "utf8").toString("base64");
    const changedIntent = githubIntent({ owner, repo, path, branch, message: `Vira PROD-13 live proof ${now}`, contentBase64: changedBase64 });
    let effectAccepted = false;

    try {
      const write = await runViraPrivateExecution({
        permit: permit({ providerId: "github", connectionId: "github.live-proof", actionId: "github.repository.file.update", actionIntent: changedIntent, ref, now }),
        nowEpochMs: Date.now(),
        secretProvider: secretProvider(ref, token, now),
        adapter: createGitHubFileWriteAdapter({ http, expectedBlobSha: before.providerVersion.value }),
      });
      expect(write).toMatchObject({ ok: true, value: { dispatch: "accepted" } });
      effectAccepted = true;

      const after = observationFromPrivate(await runViraPrivateObservation({
        authority: authority({ providerId: "github", connectionId: "github.live-proof", actionIntent: changedIntent, ref, now }),
        nowEpochMs: Date.now(),
        secretProvider: secretProvider(ref, token, now),
        adapter: obsAdapter,
      }));
      expect(after.providerVersion.value).not.toBe(before.providerVersion.value);
      expect(Buffer.from(String(after.data.contentBase64 ?? ""), "base64").toString("utf8")).toContain(marker);
    } finally {
      if (effectAccepted) {
        const current = observationFromPrivate(await runViraPrivateObservation({
          authority: authority({ providerId: "github", connectionId: "github.live-proof", actionIntent: changedIntent, ref, now }),
          nowEpochMs: Date.now(),
          secretProvider: secretProvider(ref, token, now),
          adapter: obsAdapter,
        }));
        const restoreIntent = githubIntent({ owner, repo, path, branch, message: `Restore Vira PROD-13 live proof ${now}`, contentBase64: originalBase64 });
        const restore = await runViraPrivateExecution({
          permit: permit({ providerId: "github", connectionId: "github.live-proof", actionId: "github.repository.file.update", actionIntent: restoreIntent, ref, now: now + 1 }),
          nowEpochMs: Date.now(),
          secretProvider: secretProvider(ref, token, now),
          adapter: createGitHubFileWriteAdapter({ http, expectedBlobSha: current.providerVersion.value }),
        });
        expect(restore).toMatchObject({ ok: true, value: { dispatch: "accepted" } });
        const restored = observationFromPrivate(await runViraPrivateObservation({
          authority: authority({ providerId: "github", connectionId: "github.live-proof", actionIntent: restoreIntent, ref, now }),
          nowEpochMs: Date.now(),
          secretProvider: secretProvider(ref, token, now),
          adapter: obsAdapter,
        }));
        expect(String(restored.data.contentBase64 ?? "")).toBe(originalBase64);
      }
    }
  }, 60_000);

  it("performs and restores a real Google Calendar conditional update with independent rereads", async () => {
    const token = required("VIRA_PROD13_GOOGLE_ACCESS_TOKEN");
    const calendarId = required("VIRA_PROD13_GOOGLE_CALENDAR_ID");
    const eventId = required("VIRA_PROD13_GOOGLE_EVENT_ID");
    const baselineEvent = jsonObject("VIRA_PROD13_GOOGLE_EVENT_BODY_JSON");
    if (typeof baselineEvent.summary !== "string" || baselineEvent.start === undefined || baselineEvent.end === undefined) {
      throw new Error("VIRA_PROD13_GOOGLE_EVENT_BODY_JSON must describe a dedicated canary event with summary/start/end");
    }
    const now = Date.now();
    const marker = `VIRA PROD13 LIVE PROOF ${now}`;
    const ref = secretRef("google.workspace");
    const http = fetchTransport();
    const baseIntent = googleIntent(calendarId, eventId, baselineEvent);
    const obsAdapter = createGoogleCalendarObservationAdapter({ http, now: () => Date.now() });

    const before = observationFromPrivate(await runViraPrivateObservation({
      authority: authority({ providerId: "google.workspace", connectionId: "google.workspace.live-proof", actionIntent: baseIntent, ref, now }),
      nowEpochMs: Date.now(),
      secretProvider: secretProvider(ref, token, now),
      adapter: obsAdapter,
    }));
    expect(before.data.summary).toBe(baselineEvent.summary);
    expect(before.data.start).toEqual(baselineEvent.start);
    expect(before.data.end).toEqual(baselineEvent.end);

    const changedEvent: JsonObject = Object.freeze({ ...baselineEvent, summary: marker });
    const changedIntent = googleIntent(calendarId, eventId, changedEvent);
    let effectAccepted = false;

    try {
      const write = await runViraPrivateExecution({
        permit: permit({ providerId: "google.workspace", connectionId: "google.workspace.live-proof", actionId: "google.workspace.calendar.event.update", actionIntent: changedIntent, ref, now }),
        nowEpochMs: Date.now(),
        secretProvider: secretProvider(ref, token, now),
        adapter: createGoogleCalendarWriteAdapter({ http, expectedEtag: before.providerVersion.value }),
      });
      expect(write).toMatchObject({ ok: true, value: { dispatch: "accepted" } });
      effectAccepted = true;

      const after = observationFromPrivate(await runViraPrivateObservation({
        authority: authority({ providerId: "google.workspace", connectionId: "google.workspace.live-proof", actionIntent: changedIntent, ref, now }),
        nowEpochMs: Date.now(),
        secretProvider: secretProvider(ref, token, now),
        adapter: obsAdapter,
      }));
      expect(after.providerVersion.value).not.toBe(before.providerVersion.value);
      expect(after.data.summary).toBe(marker);
    } finally {
      if (effectAccepted) {
        const current = observationFromPrivate(await runViraPrivateObservation({
          authority: authority({ providerId: "google.workspace", connectionId: "google.workspace.live-proof", actionIntent: changedIntent, ref, now }),
          nowEpochMs: Date.now(),
          secretProvider: secretProvider(ref, token, now),
          adapter: obsAdapter,
        }));
        const restore = await runViraPrivateExecution({
          permit: permit({ providerId: "google.workspace", connectionId: "google.workspace.live-proof", actionId: "google.workspace.calendar.event.update", actionIntent: baseIntent, ref, now: now + 1 }),
          nowEpochMs: Date.now(),
          secretProvider: secretProvider(ref, token, now),
          adapter: createGoogleCalendarWriteAdapter({ http, expectedEtag: current.providerVersion.value }),
        });
        expect(restore).toMatchObject({ ok: true, value: { dispatch: "accepted" } });
        const restored = observationFromPrivate(await runViraPrivateObservation({
          authority: authority({ providerId: "google.workspace", connectionId: "google.workspace.live-proof", actionIntent: baseIntent, ref, now }),
          nowEpochMs: Date.now(),
          secretProvider: secretProvider(ref, token, now),
          adapter: obsAdapter,
        }));
        expect(restored.data.summary).toBe(baselineEvent.summary);
        expect(restored.data.start).toEqual(baselineEvent.start);
        expect(restored.data.end).toEqual(baselineEvent.end);
      }
    }
  }, 60_000);
});
