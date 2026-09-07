import type { ViraActionProviderVersion } from "../../packages/action-verification/src/index.js";
import type { ViraDurableExecutionStageBPermit } from "../../packages/durable-execution/src/index.js";
import type { ViraPrivateObservationAdapter } from "../../packages/private-runner/src/observation.js";
import type { ViraPrivateRunnerAdapter } from "../../packages/private-runner/src/index.js";
import {
  createGitHubFileObservationAdapter,
  createGitHubFileWriteAdapter,
  githubFileResourceIdFromIntent,
} from "./github-file-action-adapter.js";
import {
  createGoogleCalendarObservationAdapter,
  createGoogleCalendarWriteAdapter,
  googleCalendarResourceIdFromIntent,
} from "./google-calendar-action-adapter.js";
import type { ViraPrivateProviderHttpTransport } from "./provider-http.js";

export interface ViraReferenceProviderPrivateAdapters {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly observationAdapter: ViraPrivateObservationAdapter;
  readonly writeAdapter: (version: ViraActionProviderVersion) => ViraPrivateRunnerAdapter;
}

export function createReferenceProviderPrivateAdapters(input: {
  readonly permit: ViraDurableExecutionStageBPermit;
  readonly http: ViraPrivateProviderHttpTransport;
  readonly now: () => number;
}): ViraReferenceProviderPrivateAdapters {
  if (input.permit.providerId === "github") {
    return Object.freeze({
      resourceType: "github.repository.file",
      resourceId: githubFileResourceIdFromIntent(input.permit.actionIntent),
      observationAdapter: createGitHubFileObservationAdapter({ http: input.http, now: input.now }),
      writeAdapter(version: ViraActionProviderVersion) {
        if (version.kind !== "blob-sha") throw new TypeError("GitHub conditional write requires blob-sha provider version");
        return createGitHubFileWriteAdapter({ http: input.http, expectedBlobSha: version.value });
      },
    });
  }
  if (input.permit.providerId === "google.workspace") {
    return Object.freeze({
      resourceType: "google.workspace.calendar.event",
      resourceId: googleCalendarResourceIdFromIntent(input.permit.actionIntent),
      observationAdapter: createGoogleCalendarObservationAdapter({ http: input.http, now: input.now }),
      writeAdapter(version: ViraActionProviderVersion) {
        if (version.kind !== "etag") throw new TypeError("Google Calendar conditional write requires etag provider version");
        return createGoogleCalendarWriteAdapter({ http: input.http, expectedEtag: version.value });
      },
    });
  }
  throw new TypeError("reference provider private adapter is not available for this provider");
}
