import {
  COMMERCE_BRAND_PACKAGE_INPUT,
  COMMERCE_COMPONENTS,
} from "@vira-enterprise-genui/commerce-brand-kit";
import {
  generateStudioDraftV2,
  type StudioAiV2DraftResult,
  type StudioAiV2Provider,
  type StudioAiV2Request,
} from "../../../packages/studio-ai/src/index.js";

type StudioAiDocument = NonNullable<StudioAiV2Request["baseDocument"]>;

const IMPLEMENTATIONS = Object.freeze([
  Object.freeze({
    component: COMMERCE_COMPONENTS.stack,
    web: "commerce.impl.web.stack",
    ios: "commerce.impl.ios.stack",
    android: "commerce.impl.android.stack",
  }),
  Object.freeze({
    component: COMMERCE_COMPONENTS.title,
    web: "commerce.impl.web.product-title",
    ios: "commerce.impl.ios.product-title",
    android: "commerce.impl.android.product-title",
  }),
  Object.freeze({
    component: COMMERCE_COMPONENTS.price,
    web: "commerce.impl.web.product-price",
    ios: "commerce.impl.ios.product-price",
    android: "commerce.impl.android.product-price",
  }),
  Object.freeze({
    component: COMMERCE_COMPONENTS.addButton,
    web: "commerce.impl.web.add-button",
    ios: "commerce.impl.ios.add-button",
    android: "commerce.impl.android.add-button",
  }),
]);

const BRAND_DEFINITION = Object.freeze({
  identity: COMMERCE_BRAND_PACKAGE_INPUT.brand,
  design: Object.freeze({
    accent: Object.freeze({
      $type: "color",
      $value: Object.freeze({
        colorSpace: "srgb",
        components: Object.freeze([0.0666666667, 0.0941176471, 0.1529411765]),
        alpha: 1,
      }),
    }),
  }),
  components: Object.freeze({
    catalog: COMMERCE_BRAND_PACKAGE_INPUT.components,
    implementations: IMPLEMENTATIONS,
  }),
  actions: COMMERCE_BRAND_PACKAGE_INPUT.actions,
  dataSources: COMMERCE_BRAND_PACKAGE_INPUT.dataSources,
  policies: Object.freeze({
    version: "1",
    id: "commerce.studio.policies",
    mappings: Object.freeze([
      Object.freeze({
        recipe: "commerce.product-card",
        layoutPolicy: "commerce.policy.layout.product-card",
        disclosurePolicy: "commerce.policy.disclosure.standard",
      }),
    ]),
  }),
  experiences: COMMERCE_BRAND_PACKAGE_INPUT.templates,
});

function manifest(platform: "web" | "ios" | "android") {
  return Object.freeze({
    version: "1",
    id: `commerce.host.${platform}`,
    platform,
    implementationIds: Object.freeze(IMPLEMENTATIONS.map((entry) => entry[platform])),
    capabilities: Object.freeze([]),
  });
}

export const COMMERCE_STUDIO_AI_HOST_MANIFESTS = Object.freeze([
  manifest("web"),
  manifest("ios"),
  manifest("android"),
]);

export interface CommerceStudioAiDraftOptions {
  readonly hostManifests?: readonly unknown[];
}

const IDENTITY_CHANGE = /\b(change|replace|rewrite)\b[\s\S]*\bexperience\s+id\b/i;

function deterministicCandidate(request: StudioAiV2Request): StudioAiDocument {
  const base = request.baseDocument;
  if (!base) throw new Error("deterministic Studio AI demo provider requires a base document");
  const rejectableIdentityChange = IDENTITY_CHANGE.test(request.prompt);

  return {
    ...base,
    ...(rejectableIdentityChange ? { id: `${base.id}.hijacked` } : {}),
    views: base.views.map((view) => ({
      ...view,
      nodes: view.nodes.map((node) => node.component === COMMERCE_COMPONENTS.addButton
        ? { ...node, props: { ...node.props, label: "Add item securely" } }
        : node),
    })),
  };
}

export const commerceDeterministicStudioAiProvider: StudioAiV2Provider = Object.freeze({
  generate: (request: StudioAiV2Request) => deterministicCandidate(request),
});

export function generateCommerceStudioAiDraft(
  baseDocument: StudioAiDocument,
  prompt: string,
  options: CommerceStudioAiDraftOptions = {},
): Promise<StudioAiV2DraftResult> {
  return generateStudioDraftV2({
    prompt,
    experienceId: baseDocument.id,
    recipeId: baseDocument.recipeId,
    brand: BRAND_DEFINITION,
    requestedPlatforms: ["web", "ios", "android"],
    hostManifests: options.hostManifests ?? COMMERCE_STUDIO_AI_HOST_MANIFESTS,
    baseDocument,
  }, commerceDeterministicStudioAiProvider);
}
