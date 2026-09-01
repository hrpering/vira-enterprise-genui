import {
  FLIGHT_BOOKING_ARTIFACT_DIGEST,
  FLIGHT_BOOKING_ENTRYPOINT,
  FLIGHT_BOOKING_PACK_ID,
  FLIGHT_BOOKING_PACK_MANIFEST,
  FLIGHT_BOOKING_PACK_VERSION,
  FLIGHT_BOOKING_PUBLICATION,
} from "@vira-enterprise-genui/airline-brand-kit/chat-publication";
import { createViraChatBridge, type ViraChatBridge } from "@vira-enterprise-genui/genui-chat";
import {
  createViraExperienceResolver,
  createViraRuntimeCapabilityRegistry,
} from "@vira-enterprise-genui/genui-resolver";
import { parseExperienceRegistrySnapshot } from "@vira-enterprise-genui/experience-registry";
import {
  RECIPE_CARD_ARTIFACT_DIGEST,
  RECIPE_CARD_ENTRYPOINT,
  RECIPE_CARD_PACK_ID,
  RECIPE_CARD_PACK_MANIFEST,
  RECIPE_CARD_PACK_VERSION,
  RECIPE_CARD_PUBLICATION,
  RECIPE_RUNTIME_PROFILE,
} from "@vira-enterprise-genui/recipe-brand-kit";
import { FLIGHT_BOOKING_RUNTIME_PROFILE } from "../components/flight-runtime-profile.js";

const registry = parseExperienceRegistrySnapshot(JSON.stringify({
  schemaVersion: "1",
  manifests: [FLIGHT_BOOKING_PACK_MANIFEST, RECIPE_CARD_PACK_MANIFEST],
}));
if (!registry.ok) throw new Error(`Invalid demo Experience Registry: ${registry.issue.message}`);

const capabilities = createViraRuntimeCapabilityRegistry([
  FLIGHT_BOOKING_RUNTIME_PROFILE,
  RECIPE_RUNTIME_PROFILE,
]);
if (!capabilities.ok) throw new Error(`Invalid demo runtime capability registry: ${capabilities.issue.message}`);

const publicationArtifacts = new Map<string, Readonly<{ digest: string; publication: unknown }>>([
  [
    `${FLIGHT_BOOKING_PACK_ID}@${FLIGHT_BOOKING_PACK_VERSION}:${FLIGHT_BOOKING_ENTRYPOINT}`,
    Object.freeze({ digest: FLIGHT_BOOKING_ARTIFACT_DIGEST, publication: FLIGHT_BOOKING_PUBLICATION }),
  ],
  [
    `${RECIPE_CARD_PACK_ID}@${RECIPE_CARD_PACK_VERSION}:${RECIPE_CARD_ENTRYPOINT}`,
    Object.freeze({ digest: RECIPE_CARD_ARTIFACT_DIGEST, publication: RECIPE_CARD_PUBLICATION }),
  ],
]);

export function createDemoChatBridge(): ViraChatBridge {
  const resolver = createViraExperienceResolver({
    registry: registry.value,
    capabilities: capabilities.value,
    artifactResolver: {
      async resolveStudioPublication({ packId, version, artifactId, digest }) {
        const artifact = publicationArtifacts.get(`${packId}@${version}:${artifactId}`);
        if (!artifact || artifact.digest !== digest) throw new Error("unknown or mismatched Studio publication artifact");
        return artifact.publication;
      },
    },
  });
  return createViraChatBridge(resolver);
}
