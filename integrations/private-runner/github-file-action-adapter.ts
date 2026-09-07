import type { ViraPrivateObservationAdapter } from "../../packages/private-runner/src/observation.js";
import type { ViraPrivateRunnerAdapter } from "../../packages/private-runner/src/index.js";
import { parseJsonValue, type JsonObject } from "../../packages/protocol/src/index.js";
import {
  isProviderJsonObject,
  observationEnvelope,
  parseExactProviderIntent,
  privateObservationResult,
  providerResourceId,
  safeProviderNow,
  safeProviderText,
  safeProviderToken,
} from "./provider-action-common.js";
import type { ViraPrivateProviderHttpTransport } from "./provider-http.js";

const GITHUB_INTENT_FIELDS = new Set([
  "version",
  "kind",
  "owner",
  "repo",
  "path",
  "branch",
  "message",
  "contentBase64",
]);
const GITHUB_SHA = /^[a-f0-9]{40}$/i;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface ViraGitHubFileUpdateIntent {
  readonly version: "1";
  readonly kind: "github.repository.file.update";
  readonly owner: string;
  readonly repo: string;
  readonly path: string;
  readonly branch: string;
  readonly message: string;
  readonly contentBase64: string;
}

function parseIntent(input: unknown): ViraGitHubFileUpdateIntent {
  const value = parseExactProviderIntent(input, GITHUB_INTENT_FIELDS);
  if (
    value.version !== "1"
    || value.kind !== "github.repository.file.update"
    || !safeProviderToken(value.owner)
    || !safeProviderToken(value.repo)
    || !safeProviderText(value.path, 2048)
    || value.path.startsWith("/")
    || value.path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
    || !safeProviderText(value.branch, 512)
    || !safeProviderText(value.message, 1024)
    || typeof value.contentBase64 !== "string"
    || value.contentBase64.length < 4
    || value.contentBase64.length > 1024 * 1024
    || !BASE64.test(value.contentBase64)
  ) throw new TypeError("GitHub file update intent is invalid");
  return Object.freeze({
    version: "1",
    kind: "github.repository.file.update",
    owner: value.owner,
    repo: value.repo,
    path: value.path,
    branch: value.branch,
    message: value.message,
    contentBase64: value.contentBase64,
  });
}

function githubPath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function resourceId(intent: ViraGitHubFileUpdateIntent): string {
  return providerResourceId("github.repository.file", [intent.owner, intent.repo, intent.path, intent.branch]);
}

function parseFileBody(input: unknown): Readonly<{ readonly sha: string; readonly path: string; readonly contentBase64: string }> {
  const parsed = parseJsonValue(input, "$.github.file");
  if (!parsed.ok || !isProviderJsonObject(parsed.value)) throw new TypeError("GitHub file read returned invalid JSON");
  const value = parsed.value;
  if (
    value.type !== "file"
    || typeof value.sha !== "string"
    || !GITHUB_SHA.test(value.sha)
    || typeof value.path !== "string"
    || value.path.length < 1
    || value.path.length > 2048
    || value.encoding !== "base64"
    || typeof value.content !== "string"
  ) throw new TypeError("GitHub file read returned invalid file evidence");
  const contentBase64 = value.content.replace(/[\r\n]/g, "");
  if (contentBase64.length < 4 || contentBase64.length > 1024 * 1024 || !BASE64.test(contentBase64)) {
    throw new TypeError("GitHub file read returned invalid base64 content");
  }
  return Object.freeze({ sha: value.sha.toLowerCase(), path: value.path, contentBase64 });
}

function providerRejected(status: number, code: string): Readonly<{ dispatch: "rejected"; data: JsonObject }> {
  return Object.freeze({
    dispatch: "rejected" as const,
    data: Object.freeze({ code, providerStatus: status }),
  });
}

export function createGitHubFileObservationAdapter(input: {
  readonly http: ViraPrivateProviderHttpTransport;
  readonly now: () => number;
}): ViraPrivateObservationAdapter {
  if (input === null || typeof input !== "object" || input.http === null || typeof input.http !== "object" || typeof input.http.request !== "function" || typeof input.now !== "function") {
    throw new TypeError("GitHub observation adapter dependencies are invalid");
  }
  return Object.freeze({
    async observe(
      observationInput: Parameters<ViraPrivateObservationAdapter["observe"]>[0],
    ) {
      const { authority, credential } = observationInput;
      if (authority.providerId !== "github") throw new TypeError("GitHub observation adapter requires github provider authority");
      const intent = parseIntent(authority.actionIntent);
      const response = await input.http.request({
        method: "GET",
        url: `https://api.github.com/repos/${encodeURIComponent(intent.owner)}/${encodeURIComponent(intent.repo)}/contents/${githubPath(intent.path)}?ref=${encodeURIComponent(intent.branch)}`,
        headers: Object.freeze({
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${credential}`,
          "X-GitHub-Api-Version": "2026-03-10",
        }),
      });
      if (response.status !== 200) throw new Error("GitHub file read did not return an observable resource");
      const file = parseFileBody(response.body);
      const data: JsonObject = Object.freeze({
        owner: intent.owner,
        repo: intent.repo,
        path: file.path,
        branch: intent.branch,
        sha: file.sha,
        contentBase64: file.contentBase64,
      });
      const observation = observationEnvelope({
        scope: authority.scope,
        connectionId: authority.connectionId,
        providerId: "github",
        resourceType: "github.repository.file",
        resourceId: resourceId(intent),
        observedAtEpochMs: safeProviderNow(input.now),
        versionKind: "blob-sha",
        versionValue: file.sha,
        data,
      });
      return privateObservationResult(observation);
    },
  });
}

export function createGitHubFileWriteAdapter(input: {
  readonly http: ViraPrivateProviderHttpTransport;
  readonly expectedBlobSha: string;
}): ViraPrivateRunnerAdapter {
  if (
    input === null
    || typeof input !== "object"
    || input.http === null
    || typeof input.http !== "object"
    || typeof input.http.request !== "function"
    || typeof input.expectedBlobSha !== "string"
    || !GITHUB_SHA.test(input.expectedBlobSha)
  ) throw new TypeError("GitHub write adapter dependencies are invalid");
  const expectedBlobSha = input.expectedBlobSha.toLowerCase();
  return Object.freeze({
    async invoke(
      invocationInput: Parameters<ViraPrivateRunnerAdapter["invoke"]>[0],
    ) {
      const { permit, credential } = invocationInput;
      if (permit.providerId !== "github") throw new TypeError("GitHub write adapter requires github provider permit");
      const intent = parseIntent(permit.actionIntent);
      const response = await input.http.request({
        method: "PUT",
        url: `https://api.github.com/repos/${encodeURIComponent(intent.owner)}/${encodeURIComponent(intent.repo)}/contents/${githubPath(intent.path)}`,
        headers: Object.freeze({
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2026-03-10",
        }),
        body: JSON.stringify({
          message: intent.message,
          content: intent.contentBase64,
          sha: expectedBlobSha,
          branch: intent.branch,
        }),
      });
      if (response.status >= 500) throw new Error("GitHub file update returned uncertain provider status");
      if (response.status === 409) return providerRejected(response.status, "precondition-conflict");
      if (response.status !== 200) return providerRejected(response.status, "provider-write-rejected");
      return Object.freeze({
        dispatch: "accepted" as const,
        data: Object.freeze({ code: "provider-write-accepted", providerStatus: response.status }),
      });
    },
  });
}

export function githubFileResourceIdFromIntent(input: unknown): string {
  return resourceId(parseIntent(input));
}
