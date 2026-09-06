import {
  serializeViraApplicationPackageV2,
  type ViraApplicationPackageV2,
} from "../../../packages/application-package/src/index.js";
import {
  createViraApplicationDeploymentPlane,
  type ViraApplicationDeploymentRecord,
  type ViraApplicationEnvironmentBinding,
  type ViraSignedApplicationDistribution,
} from "../../../packages/deployment-plane/src/index.js";

const ORGANIZATION_ID = "org-commerce";
const PROJECT_ID = "experience-studio-demo";
const PUBLISHER_ID = "commerce";
const AUTHENTICATION_REF = "auth:commerce:studio-demo";
const SIGNATURE_KEY_ID = "key:commerce:studio-demo";
const SIGNATURE_VALUE = "00112233445566778899aabbccddeeff";

async function sha256Hex(value: string): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  try {
    const digest = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(value)));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

function binding(environment: "dev" | "staging"): ViraApplicationEnvironmentBinding {
  return {
    version: "1",
    bindingRef: `binding:${ORGANIZATION_ID}:${PROJECT_ID}:${environment}:1`,
    scope: { version: "1", organizationId: ORGANIZATION_ID, projectId: PROJECT_ID, environment },
    providerIdentityRef: "provider:commerce:studio-demo",
    location: "local-demo",
    adapterRef: "adapter:studio:application:1",
    secretRef: {
      version: "1",
      organizationId: ORGANIZATION_ID,
      projectId: PROJECT_ID,
      environment,
      provider: "kms",
      key: "studio-demo",
    },
    trustStatus: "trusted",
    trustEvidenceRef: "trust:commerce:studio-demo:1",
  };
}

const planeResult = createViraApplicationDeploymentPlane({
  trust: {
    verifyDistributionIntegrity: async ({ digest, canonicalArtifact }) =>
      await sha256Hex(canonicalArtifact) === digest,
    verifyPublisherProvenance: ({ publisherId, principal, authenticationRef }) =>
      publisherId === PUBLISHER_ID
      && principal.organizationId === ORGANIZATION_ID
      && authenticationRef === AUTHENTICATION_REF,
    verifySignature: ({ canonicalAttestation, signature }) =>
      signature.algorithm === "ed25519"
      && signature.keyId === SIGNATURE_KEY_ID
      && signature.value === SIGNATURE_VALUE
      && canonicalAttestation.includes(`"publisherId":"${PUBLISHER_ID}"`),
  },
});
if (!planeResult.ok) throw new Error(`demo deployment plane rejected: ${planeResult.issue.code}`);
const deploymentPlane = planeResult.value;

export interface StudioStagingDeploymentValue {
  readonly release: { readonly id: string; readonly version: string };
  readonly distributionDigest: string;
  readonly dev: ViraApplicationDeploymentRecord;
  readonly staging: ViraApplicationDeploymentRecord;
}

export type StudioStagingDeploymentResult =
  | { readonly ok: true; readonly value: StudioStagingDeploymentValue }
  | {
      readonly ok: false;
      readonly issue: {
        readonly stage: "serialize" | "digest" | "publish" | "promote";
        readonly code: string;
        readonly message: string;
      };
    };

export async function publishStudioApplicationToStaging(
  application: ViraApplicationPackageV2,
): Promise<StudioStagingDeploymentResult> {
  const serialized = serializeViraApplicationPackageV2(application);
  if (!serialized.ok) {
    return {
      ok: false,
      issue: { stage: "serialize", code: serialized.issue.code, message: serialized.issue.message },
    };
  }
  const digest = await sha256Hex(serialized.value);
  if (!digest) {
    return {
      ok: false,
      issue: { stage: "digest", code: "CRYPTO_UNAVAILABLE", message: "SHA-256 is unavailable for the demo Application distribution" },
    };
  }

  const artifact: ViraSignedApplicationDistribution = {
    version: "2",
    artifactKind: "application-distribution",
    distribution: {
      schemaVersion: "2",
      application,
      integrity: { algorithm: "sha256", digest },
    },
    provenance: {
      version: "1",
      publisherId: PUBLISHER_ID,
      principal: {
        version: "1",
        kind: "service",
        id: "studio-demo-publisher",
        organizationId: ORGANIZATION_ID,
      },
      authenticationRef: AUTHENTICATION_REF,
    },
    signature: {
      algorithm: "ed25519",
      keyId: SIGNATURE_KEY_ID,
      value: SIGNATURE_VALUE,
    },
  };

  const dev = await deploymentPlane.publish({ artifact, binding: binding("dev") });
  if (!dev.ok) {
    return {
      ok: false,
      issue: { stage: "publish", code: dev.issue.code, message: dev.issue.message },
    };
  }
  const staging = await deploymentPlane.promote({
    release: dev.value.release,
    distributionDigest: dev.value.distributionDigest,
    from: "dev",
    to: "staging",
    binding: binding("staging"),
  });
  if (!staging.ok) {
    return {
      ok: false,
      issue: { stage: "promote", code: staging.issue.code, message: staging.issue.message },
    };
  }

  return {
    ok: true,
    value: Object.freeze({
      release: Object.freeze({ ...staging.value.release }),
      distributionDigest: staging.value.distributionDigest,
      dev: dev.value,
      staging: staging.value,
    }),
  };
}
