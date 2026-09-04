export const VIRA_EXTERNAL_BRAND_SDK_VERSION = "1" as const;

export interface ViraBrandIssue {
  readonly version: typeof VIRA_EXTERNAL_BRAND_SDK_VERSION;
  readonly code: "CONFIGURATION_REJECTED" | "MOUNT_REJECTED" | "WRAPPER_REJECTED" | "TRANSPORT_REJECTED" | "RESPONSE_REJECTED";
  readonly message: string;
}

export interface ViraBrandExperienceRequest {
  readonly version: typeof VIRA_EXTERNAL_BRAND_SDK_VERSION;
  readonly experienceId: string;
  readonly environment: "dev" | "staging" | "production";
  readonly versionRef?: string;
}

export interface ViraBrandExperienceResponse {
  readonly version: typeof VIRA_EXTERNAL_BRAND_SDK_VERSION;
  readonly experience: unknown;
}

export interface ViraBrandTransport {
  request(input: ViraBrandExperienceRequest): Promise<unknown>;
}
