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
import { FLIGHT_BOOKING_RUNTIME_PROFILE } from "../components/flight-runtime-profile.js";

const registry = parseExperienceRegistrySnapshot(JSON.stringify({
  schemaVersion: "1",
  manifests: [FLIGHT_BOOKING_PACK_MANIFEST],
}));
if (!registry.ok) throw new Error(`Invalid flight Experience Registry: ${registry.issue.message}`);
const registrySnapshot = registry.value;

const capabilities = createViraRuntimeCapabilityRegistry([FLIGHT_BOOKING_RUNTIME_PROFILE]);
if (!capabilities.ok) throw new Error(`Invalid flight runtime capability profile: ${capabilities.issue.message}`);
const capabilityRegistry = capabilities.value;

export function createFlightChatBridge(): ViraChatBridge {
  const resolver = createViraExperienceResolver({
    registry: registrySnapshot,
    capabilities: capabilityRegistry,
    artifactResolver: {
      async resolveStudioPublication({ packId, version, artifactId, digest }) {
        if (
          packId !== FLIGHT_BOOKING_PACK_ID
          || version !== FLIGHT_BOOKING_PACK_VERSION
          || artifactId !== FLIGHT_BOOKING_ENTRYPOINT
          || digest !== FLIGHT_BOOKING_ARTIFACT_DIGEST
        ) {
          throw new Error("unknown flight publication artifact");
        }
        return FLIGHT_BOOKING_PUBLICATION;
      },
    },
  });
  return createViraChatBridge(resolver);
}
