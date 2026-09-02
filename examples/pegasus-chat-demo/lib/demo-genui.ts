import {
  FLIGHT_BOOKING_ARTIFACT_DIGEST,
  FLIGHT_BOOKING_ENTRYPOINT,
  FLIGHT_BOOKING_PACK_ID,
  FLIGHT_BOOKING_PACK_MANIFEST,
  FLIGHT_BOOKING_PACK_VERSION,
  FLIGHT_BOOKING_PUBLICATION,
} from "@vira-enterprise-genui/airline-brand-kit/chat-publication";
import {
  AIRLINE_GUIDANCE_ARTIFACT_DIGEST,
  AIRLINE_GUIDANCE_ENTRYPOINT,
  AIRLINE_GUIDANCE_PACK_ID,
  AIRLINE_GUIDANCE_PACK_MANIFEST,
  AIRLINE_GUIDANCE_PACK_VERSION,
  AIRLINE_GUIDANCE_PUBLICATION,
} from "@vira-enterprise-genui/airline-brand-kit/guidance-publication";
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
import { AIRLINE_GUIDANCE_RUNTIME_PROFILE } from "../components/guidance-runtime-profile.js";

const registry = parseExperienceRegistrySnapshot(JSON.stringify({
  schemaVersion: "1",
  manifests: [
    FLIGHT_BOOKING_PACK_MANIFEST,
    RECIPE_CARD_PACK_MANIFEST,
    AIRLINE_GUIDANCE_PACK_MANIFEST,
  ],
}));
if (!registry.ok) throw new Error(`Invalid demo Experience Registry: ${registry.issue.message}`);
const registrySnapshot = registry.value;

const capabilities = createViraRuntimeCapabilityRegistry([
  FLIGHT_BOOKING_RUNTIME_PROFILE,
  RECIPE_RUNTIME_PROFILE,
  AIRLINE_GUIDANCE_RUNTIME_PROFILE,
]);
if (!capabilities.ok) throw new Error(`Invalid demo runtime capability registry: ${capabilities.issue.message}`);
const capabilityRegistry = capabilities.value;

const publicationArtifacts = new Map<string, Readonly<{ digest: string; publication: unknown }>>([
  [
    `${FLIGHT_BOOKING_PACK_ID}@${FLIGHT_BOOKING_PACK_VERSION}:${FLIGHT_BOOKING_ENTRYPOINT}`,
    Object.freeze({ digest: FLIGHT_BOOKING_ARTIFACT_DIGEST, publication: FLIGHT_BOOKING_PUBLICATION }),
  ],
  [
    `${RECIPE_CARD_PACK_ID}@${RECIPE_CARD_PACK_VERSION}:${RECIPE_CARD_ENTRYPOINT}`,
    Object.freeze({ digest: RECIPE_CARD_ARTIFACT_DIGEST, publication: RECIPE_CARD_PUBLICATION }),
  ],
  [
    `${AIRLINE_GUIDANCE_PACK_ID}@${AIRLINE_GUIDANCE_PACK_VERSION}:${AIRLINE_GUIDANCE_ENTRYPOINT}`,
    Object.freeze({ digest: AIRLINE_GUIDANCE_ARTIFACT_DIGEST, publication: AIRLINE_GUIDANCE_PUBLICATION }),
  ],
]);

export function createDemoChatBridge(): ViraChatBridge {
  const resolver = createViraExperienceResolver({
    registry: registrySnapshot,
    capabilities: capabilityRegistry,
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
