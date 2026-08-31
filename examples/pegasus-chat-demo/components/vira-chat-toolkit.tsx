"use client";

import { defineToolkit } from "@assistant-ui/react";
import { isViraFlightExperienceResult } from "../lib/vira-chat-contract";
import { CanonicalStudioFlightExperience } from "./canonical-studio-flight";
import { viraChatToolkit as reservationToolkit } from "./vira-chat-connector";
import guidanceToolkit from "./vira-guidance-toolkit";

export const viraChatToolkit = defineToolkit({
  ...reservationToolkit,
  ...guidanceToolkit,
  vira_present_experience: {
    type: "backend",
    display: "standalone",
    render: ({ result, status }) => {
      if (status.type === "running" || result === undefined) {
        return (
          <div className="flight-loading" aria-live="polite">
            <span className="flight-loading-dot" />
            Preparing your approved GenUI experience…
          </div>
        );
      }
      if (!isViraFlightExperienceResult(result)) {
        return <div className="flight-error">This Vira experience could not be displayed.</div>;
      }
      return <CanonicalStudioFlightExperience result={result} />;
    },
  },
});
