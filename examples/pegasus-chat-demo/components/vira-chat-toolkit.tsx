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
const feedbackStyle = Object.freeze({
  marginTop: 12,
  padding: "15px 17px",
  border: "1px solid #e7e8ec",
  borderRadius: 16,
  background: "#fafbfc",
  color: "#596071",
  fontSize: 13,
});

function failure(message: string) {
  return <div style={feedbackStyle}>{message}</div>;
}

function loading(message: string) {
  return (
    <div style={{ ...feedbackStyle, display: "flex", alignItems: "center", gap: 9 }} aria-live="polite">
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: 999, background: "#ffd500", boxShadow: "0 0 0 4px rgba(255, 213, 0, 0.18)" }}
      />
      {message}
    </div>
  );
}

export const viraChatToolkit = defineToolkit({
  ...guidanceToolkit,
  vira_experience: {
    type: "backend",
    display: "standalone",
    render: ({ result, status }) => {
      if (status.type === "running" || result === undefined) {
        return loading("Preparing your approved GenUI experience…");
      }

      const parsed = parseViraExperienceMessage(result);
      if (!parsed.ok) return failure("This Vira experience message was rejected safely.");
      if (parsed.value.op === "present") {
        return (
          <ViraChatExperience
            bridge={experienceBridge}
            message={result}
            pending={loading("Resolving the approved Experience Pack…")}
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
