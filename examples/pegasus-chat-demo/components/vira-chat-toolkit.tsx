"use client";

import { defineToolkit } from "@assistant-ui/react";
import {
  ViraChatCommandEffect,
  ViraChatExperience,
} from "@vira-enterprise-genui/genui-chat";
import { parseViraExperienceMessage } from "@vira-enterprise-genui/genui-resolver";
import { createDemoChatBridge } from "../lib/demo-genui.js";
import guidanceToolkit from "./vira-guidance-toolkit";

const experienceBridge = createDemoChatBridge();

function failure(message: string) {
  return <div className="flight-error">{message}</div>;
}

export const viraChatToolkit = defineToolkit({
  ...guidanceToolkit,
  vira_experience: {
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

      const parsed = parseViraExperienceMessage(result);
      if (!parsed.ok) return failure("This Vira experience message was rejected safely.");
      if (parsed.value.op === "present") {
        return (
          <ViraChatExperience
            bridge={experienceBridge}
            message={result}
            pending={(
              <div className="flight-loading" aria-live="polite">
                <span className="flight-loading-dot" />
                Resolving the approved Experience Pack…
              </div>
            )}
            renderFailure={() => failure("This Vira experience could not be displayed.")}
          />
        );
      }
      return (
        <ViraChatCommandEffect
          bridge={experienceBridge}
          message={result}
          renderFailure={() => failure("This change could not be applied to the requested experience.")}
        />
      );
    },
  },
});
