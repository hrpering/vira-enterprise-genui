import {
  DEFAULT_MOCK_RUNTIME_INPUT,
  createMockAirlineRuntimeData,
} from "@vira-enterprise-genui/mock-airline-domain";
import { createMockAirlineStudioCollectionData } from "@vira-enterprise-genui/mock-airline-domain/studio-collections";
import { prepareStudioPublication } from "@vira-enterprise-genui/studio-publish";
import {
  actionAdapter,
  applyMockDomainBindings,
  bindingSourceCatalog,
  componentCatalog,
  createGoldenAirlineExperience,
  runtimePermissionPolicy,
  runtimeRenderers,
} from "@vira-enterprise-genui/experience-studio-demo/reference";
import {
  VIRA_FLIGHT_STUDIO_PUBLICATION,
  type ViraFlightExperienceResult,
} from "./vira-chat-contract";

export type ChatStudioPublicationResolution =
  | {
      readonly ok: true;
      readonly value: {
        readonly publicationId: typeof VIRA_FLIGHT_STUDIO_PUBLICATION;
        readonly publication: Extract<ReturnType<typeof prepareStudioPublication>, { readonly ok: true }>["value"];
        readonly componentCatalog: typeof componentCatalog;
        readonly bindingSourceCatalog: typeof bindingSourceCatalog;
        readonly actionAdapter: typeof actionAdapter;
        readonly permissionPolicy: typeof runtimePermissionPolicy;
        readonly renderers: typeof runtimeRenderers;
        readonly runtimeData: Readonly<Record<string, unknown>>;
      };
    }
  | { readonly ok: false; readonly issue: { readonly code: "UNSUPPORTED_PUBLICATION" | "PUBLICATION_INVALID"; readonly message: string } };

export function resolveChatStudioPublication(
  result: ViraFlightExperienceResult,
): ChatStudioPublicationResolution {
  const publicationId = result.publication ?? VIRA_FLIGHT_STUDIO_PUBLICATION;
  if (publicationId !== VIRA_FLIGHT_STUDIO_PUBLICATION) {
    return { ok: false, issue: { code: "UNSUPPORTED_PUBLICATION", message: "Chat result references an unapproved Studio publication" } };
  }

  const document = applyMockDomainBindings(createGoldenAirlineExperience(publicationId));
  const publication = prepareStudioPublication({
    document,
    componentCatalog,
    bindingSourceCatalog,
    actionAdapter,
  });
  if (!publication.ok) {
    return { ok: false, issue: { code: "PUBLICATION_INVALID", message: publication.issue.message } };
  }

  const input = {
    ...DEFAULT_MOCK_RUNTIME_INPUT,
    origin: result.input.origin,
    destination: result.input.destination,
    departureDate: result.input.departureDate,
    passengers: result.input.passengers,
  };
  return {
    ok: true,
    value: {
      publicationId,
      publication: publication.value,
      componentCatalog,
      bindingSourceCatalog,
      actionAdapter,
      permissionPolicy: runtimePermissionPolicy,
      renderers: runtimeRenderers,
      runtimeData: Object.freeze({
        ...createMockAirlineRuntimeData(input),
        ...createMockAirlineStudioCollectionData(input),
      }),
    },
  };
}
