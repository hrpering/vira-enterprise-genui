"use client";

import { defineToolkit } from "@assistant-ui/react";
import { StudioPublishedFlightExperience } from "./studio-published-flight-experience";
import { viraChatToolkit as reservationToolkit } from "./vira-chat-connector";
import guidanceToolkit from "./vira-guidance-toolkit";
import { isViraFlightExperienceResult } from "../lib/vira-chat-contract";

const studioPublishedExperienceTool = {
  type: "backend" as const,
  display: "standalone" as const,
  render: ({ result, status }: { result: unknown; status: { type: string } }) => {
    if (status.type === "running" || result === undefined) {
      return (
        <div className="flight-loading" aria-live="polite">
          <span className="flight-loading-dot" />
          Preparing your published Vira experience…
        </div>
      );
    }
    if (!isViraFlightExperienceResult(result)) {
      return <div className="flight-error">This Vira experience could not be displayed.</div>;
    }
    return (
      <StudioPublishedFlightExperience
        result={result}
        fallback={<div className="flight-error">The published Vira experience could not be loaded.</div>}
      />
    );
  },
};

const studioChatEnabled = process.env.NEXT_PUBLIC_VIRA_STUDIO_CHAT === "1";

export const viraChatToolkit = defineToolkit({
  ...reservationToolkit,
  ...(studioChatEnabled ? { vira_present_experience: studioPublishedExperienceTool } : {}),
  ...guidanceToolkit,
});
