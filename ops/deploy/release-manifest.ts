export type ViraPromotionEnvironment = "staging" | "production";

export interface ViraReleaseManifest {
  readonly version: "1";
  readonly environment: ViraPromotionEnvironment;
  readonly buildSha: string;
  readonly releaseId: string;
  readonly webDeploymentId: string;
  readonly webDeploymentUrl: string;
  readonly apiDeploymentId: string;
  readonly workerDeploymentId: string;
}

const BUILD_SHA_PATTERN = /^[a-f0-9]{7,64}$/i;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const VERCEL_DEPLOYMENT_ID_PATTERN = /^dpl_[A-Za-z0-9]{8,128}$/;
const RAILWAY_DEPLOYMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPECTED_KEYS = [
  "apiDeploymentId",
  "buildSha",
  "environment",
  "releaseId",
  "version",
  "webDeploymentId",
  "webDeploymentUrl",
  "workerDeploymentId",
];

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${key} must be a non-empty string`);
  return value.trim();
}

export function parseViraReleaseManifest(value: unknown): ViraReleaseManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("release manifest must be an object");
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== EXPECTED_KEYS.length || keys.some((key, index) => key !== EXPECTED_KEYS[index])) {
    throw new Error("release manifest contains missing or unknown fields");
  }

  if (record.version !== "1") throw new Error("release manifest version must be 1");
  const environment = requiredString(record, "environment");
  if (environment !== "staging" && environment !== "production") throw new Error("release environment must be staging or production");
  const buildSha = requiredString(record, "buildSha");
  if (!BUILD_SHA_PATTERN.test(buildSha)) throw new Error("release buildSha must be hexadecimal");
  const releaseId = requiredString(record, "releaseId");
  if (!RELEASE_ID_PATTERN.test(releaseId)) throw new Error("releaseId is invalid");

  const webDeploymentId = requiredString(record, "webDeploymentId");
  if (!VERCEL_DEPLOYMENT_ID_PATTERN.test(webDeploymentId)) throw new Error("webDeploymentId must be an exact Vercel deployment ID");
  const webDeploymentUrl = requiredString(record, "webDeploymentUrl");
  const url = new URL(webDeploymentUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app")) {
    throw new Error("webDeploymentUrl must be an HTTPS Vercel deployment URL");
  }

  const apiDeploymentId = requiredString(record, "apiDeploymentId");
  const workerDeploymentId = requiredString(record, "workerDeploymentId");
  if (!RAILWAY_DEPLOYMENT_ID_PATTERN.test(apiDeploymentId) || !RAILWAY_DEPLOYMENT_ID_PATTERN.test(workerDeploymentId)) {
    throw new Error("API and worker deployment IDs must be exact Railway deployment UUIDs");
  }
  if (apiDeploymentId === workerDeploymentId) throw new Error("API and worker must record independent Railway deployments");

  return {
    version: "1",
    environment,
    buildSha: buildSha.toLowerCase(),
    releaseId,
    webDeploymentId,
    webDeploymentUrl: url.toString(),
    apiDeploymentId: apiDeploymentId.toLowerCase(),
    workerDeploymentId: workerDeploymentId.toLowerCase(),
  };
}
