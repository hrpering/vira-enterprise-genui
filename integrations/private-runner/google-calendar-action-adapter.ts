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
} from "./provider-action-common.js";
import type { ViraPrivateProviderHttpTransport } from "./provider-http.js";

const GOOGLE_INTENT_FIELDS = new Set([
  "version",
  "kind",
  "calendarId",
  "eventId",
  "event",
]);

export interface ViraGoogleCalendarEventUpdateIntent {
  readonly version: "1";
  readonly kind: "google.workspace.calendar.event.update";
  readonly calendarId: string;
  readonly eventId: string;
  readonly event: JsonObject;
}

function parseIntent(input: unknown): ViraGoogleCalendarEventUpdateIntent {
  const value = parseExactProviderIntent(input, GOOGLE_INTENT_FIELDS);
  if (
    value.version !== "1"
    || value.kind !== "google.workspace.calendar.event.update"
    || !safeProviderText(value.calendarId, 1024)
    || !safeProviderText(value.eventId, 1024)
    || !isProviderJsonObject(value.event)
  ) throw new TypeError("Google Calendar event update intent is invalid");
  const parsedEvent = parseJsonValue(value.event, "$.actionIntent.event");
  if (!parsedEvent.ok || !isProviderJsonObject(parsedEvent.value)) throw new TypeError("Google Calendar event body is invalid");
  if (Buffer.byteLength(JSON.stringify(parsedEvent.value), "utf8") > 512 * 1024) {
    throw new TypeError("Google Calendar event update body exceeds the bounded size");
  }
  return Object.freeze({
    version: "1",
    kind: "google.workspace.calendar.event.update",
    calendarId: value.calendarId,
    eventId: value.eventId,
    event: Object.freeze({ ...parsedEvent.value }),
  });
}

function resourceId(intent: ViraGoogleCalendarEventUpdateIntent): string {
  return providerResourceId("google.workspace.calendar.event", [intent.calendarId, intent.eventId]);
}

function parseEventBody(input: unknown): Readonly<{ readonly etag: string; readonly data: JsonObject }> {
  const parsed = parseJsonValue(input, "$.google.calendar.event");
  if (!parsed.ok || !isProviderJsonObject(parsed.value)) throw new TypeError("Google Calendar read returned invalid JSON");
  if (typeof parsed.value.etag !== "string" || parsed.value.etag.length < 1 || parsed.value.etag.length > 512) {
    throw new TypeError("Google Calendar read returned invalid ETag evidence");
  }
  return Object.freeze({ etag: parsed.value.etag, data: Object.freeze({ ...parsed.value }) });
}

function providerRejected(status: number, code: string): Readonly<{ dispatch: "rejected"; data: JsonObject }> {
  return Object.freeze({
    dispatch: "rejected" as const,
    data: Object.freeze({ code, providerStatus: status }),
  });
}

function eventUrl(intent: ViraGoogleCalendarEventUpdateIntent): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(intent.calendarId)}/events/${encodeURIComponent(intent.eventId)}`;
}

export function createGoogleCalendarObservationAdapter(input: {
  readonly http: ViraPrivateProviderHttpTransport;
  readonly now: () => number;
}): ViraPrivateObservationAdapter {
  if (input === null || typeof input !== "object" || input.http === null || typeof input.http !== "object" || typeof input.http.request !== "function" || typeof input.now !== "function") {
    throw new TypeError("Google Calendar observation adapter dependencies are invalid");
  }
  return Object.freeze({
    async observe(
      observationInput: Parameters<ViraPrivateObservationAdapter["observe"]>[0],
    ) {
      const { authority, credential } = observationInput;
      if (authority.providerId !== "google.workspace") throw new TypeError("Google Calendar observation adapter requires google.workspace provider authority");
      const intent = parseIntent(authority.actionIntent);
      const response = await input.http.request({
        method: "GET",
        url: eventUrl(intent),
        headers: Object.freeze({
          Accept: "application/json",
          Authorization: `Bearer ${credential}`,
        }),
      });
      if (response.status !== 200) throw new Error("Google Calendar read did not return an observable resource");
      const event = parseEventBody(response.body);
      const observation = observationEnvelope({
        scope: authority.scope,
        connectionId: authority.connectionId,
        providerId: "google.workspace",
        resourceType: "google.workspace.calendar.event",
        resourceId: resourceId(intent),
        observedAtEpochMs: safeProviderNow(input.now),
        versionKind: "etag",
        versionValue: event.etag,
        data: event.data,
      });
      return privateObservationResult(observation);
    },
  });
}

export function createGoogleCalendarWriteAdapter(input: {
  readonly http: ViraPrivateProviderHttpTransport;
  readonly expectedEtag: string;
}): ViraPrivateRunnerAdapter {
  if (
    input === null
    || typeof input !== "object"
    || input.http === null
    || typeof input.http !== "object"
    || typeof input.http.request !== "function"
    || typeof input.expectedEtag !== "string"
    || input.expectedEtag.length < 1
    || input.expectedEtag.length > 512
  ) throw new TypeError("Google Calendar write adapter dependencies are invalid");
  const expectedEtag = input.expectedEtag;
  return Object.freeze({
    async invoke(
      invocationInput: Parameters<ViraPrivateRunnerAdapter["invoke"]>[0],
    ) {
      const { permit, credential } = invocationInput;
      if (permit.providerId !== "google.workspace") throw new TypeError("Google Calendar write adapter requires google.workspace provider permit");
      const intent = parseIntent(permit.actionIntent);
      const response = await input.http.request({
        method: "PUT",
        url: eventUrl(intent),
        headers: Object.freeze({
          Accept: "application/json",
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
          "If-Match": expectedEtag,
        }),
        body: JSON.stringify(intent.event),
      });
      if (response.status >= 500) throw new Error("Google Calendar update returned uncertain provider status");
      if (response.status === 412) return providerRejected(response.status, "precondition-conflict");
      if (response.status !== 200) return providerRejected(response.status, "provider-write-rejected");
      return Object.freeze({
        dispatch: "accepted" as const,
        data: Object.freeze({ code: "provider-write-accepted", providerStatus: response.status }),
      });
    },
  });
}

export function googleCalendarResourceIdFromIntent(input: unknown): string {
  return resourceId(parseIntent(input));
}
