export const VIRA_ENVIRONMENTS = ["development", "staging", "production"] as const;
export type ViraEnvironment = (typeof VIRA_ENVIRONMENTS)[number];
export type ViraServiceName = "vira-api" | "vira-worker";

export interface ViraRuntimeEnvironment {
  readonly service: ViraServiceName;
  readonly environment: ViraEnvironment;
  readonly port: number;
  readonly buildSha: string;
  readonly releaseId: string;
}

const BUILD_SHA_PATTERN = /^[a-f0-9]{7,64}$/i;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required`);
  return value.trim();
}

export function parseViraRuntimeEnvironment(
  env: NodeJS.ProcessEnv,
  service: ViraServiceName,
): ViraRuntimeEnvironment {
  const environmentValue = required(env.VIRA_ENVIRONMENT, "VIRA_ENVIRONMENT");
  if (!VIRA_ENVIRONMENTS.includes(environmentValue as ViraEnvironment)) {
    throw new Error("VIRA_ENVIRONMENT must be development, staging or production");
  }

  const portValue = required(env.PORT, "PORT");
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be an integer from 1 to 65535");

  const buildSha = required(env.VIRA_BUILD_SHA ?? env.RAILWAY_GIT_COMMIT_SHA, "VIRA_BUILD_SHA or RAILWAY_GIT_COMMIT_SHA");
  if (!BUILD_SHA_PATTERN.test(buildSha)) throw new Error("build SHA must be a bounded hexadecimal commit identifier");

  const releaseId = required(env.VIRA_RELEASE_ID ?? env.RAILWAY_DEPLOYMENT_ID, "VIRA_RELEASE_ID or RAILWAY_DEPLOYMENT_ID");
  if (!RELEASE_ID_PATTERN.test(releaseId)) throw new Error("release ID contains unsupported characters or is too long");

  return {
    service,
    environment: environmentValue as ViraEnvironment,
    port,
    buildSha: buildSha.toLowerCase(),
    releaseId,
  };
}
