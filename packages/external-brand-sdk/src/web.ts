import { createElement, type ReactElement } from "react";
import { ViraExperience as InternalViraExperience } from "@vira-enterprise-genui/react";
import { VIRA_EXTERNAL_BRAND_SDK_VERSION, type ViraBrandIssue } from "./types.js";

export interface ViraExperienceProps {
  readonly configuration: unknown;
  readonly experience: unknown;
  readonly onReady?: () => void;
  readonly onIssue?: (issue: ViraBrandIssue) => void;
}

function notify(callback: ViraExperienceProps["onIssue"], code: ViraBrandIssue["code"], message: string): void {
  if (!callback) return;
  try {
    callback(Object.freeze({ version: VIRA_EXTERNAL_BRAND_SDK_VERSION, code, message }));
  } catch {
    // Customer notifications never alter host/runtime ownership.
  }
}

export function ViraExperience(props: ViraExperienceProps): ReactElement {
  return createElement(InternalViraExperience, {
    configuration: props.configuration,
    experience: props.experience,
    onReady: () => {
      try { props.onReady?.(); } catch { /* notification only */ }
    },
    onConfigurationError: () => notify(props.onIssue, "CONFIGURATION_REJECTED", "Vira Experience configuration was rejected"),
    onMountResult: (result: unknown) => {
      if (typeof result === "object" && result !== null && "ok" in result && (result as { ok?: unknown }).ok === false) {
        notify(props.onIssue, "MOUNT_REJECTED", "Vira Experience mount was rejected");
      }
    },
    onWrapperError: () => notify(props.onIssue, "WRAPPER_REJECTED", "Vira Experience wrapper failed"),
  });
}
