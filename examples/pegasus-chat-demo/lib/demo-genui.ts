import { createViraChatBridge, type ViraChatBridge } from "@vira-enterprise-genui/genui-chat";
import {
  createViraExperienceResolver,
  createViraRuntimeCapabilityRegistry,
} from "@vira-enterprise-genui/genui-resolver";
import { parseExperienceRegistrySnapshot } from "@vira-enterprise-genui/experience-registry";
import { DEMO_EXPERIENCE_REGISTRATIONS } from "./demo-experience-registry.js";

const registry = parseExperienceRegistrySnapshot(JSON.stringify({
  schemaVersion: "1",
  manifests: DEMO_EXPERIENCE_REGISTRATIONS.map((registration) => registration.manifest),
}));
if (!registry.ok) throw new Error(`Invalid demo Experience Registry: ${registry.issue.message}`);
const registrySnapshot = registry.value;

const capabilities = createViraRuntimeCapabilityRegistry(
  DEMO_EXPERIENCE_REGISTRATIONS.map((registration) => registration.runtimeProfile),
);
if (!capabilities.ok) throw new Error(`Invalid demo runtime capability registry: ${capabilities.issue.message}`);
const capabilityRegistry = capabilities.value;

const publicationArtifacts = new Map(
  DEMO_EXPERIENCE_REGISTRATIONS.map((registration) => [
    `${registration.pack.id}@${registration.pack.version}:${registration.artifact.id}`,
    Object.freeze({
      digest: registration.artifact.digest,
      publication: registration.artifact.publication,
    }),
  ] as const),
);

export function createDemoChatBridge(): ViraChatBridge {
  const resolver = createViraExperienceResolver({
    registry: registrySnapshot,
    capabilities: capabilityRegistry,
    artifactResolver: {
      async resolveStudioPublication({ packId, version, artifactId, digest }) {
        const artifact = publicationArtifacts.get(`${packId}@${version}:${artifactId}`);
        if (!artifact || artifact.digest !== digest) {
          throw new Error("unknown or mismatched Studio publication artifact");
        }
        return artifact.publication;
      },
    },
  });
  return createViraChatBridge(resolver);
}
