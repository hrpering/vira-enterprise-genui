import { parseExperiencePackManifest } from "@vira-enterprise-genui/experience-packs";
import {
  prepareAuthoredStudioPublication,
  type StudioAuthoringDocumentInput,
} from "@vira-enterprise-genui/genui";

export const RECIPE_CARD_PACK_ID = "vira/recipe" as const;
export const RECIPE_CARD_PACK_VERSION = "1.0.0" as const;
export const RECIPE_CARD_ENTRYPOINT = "card" as const;
export const RECIPE_CARD_ARTIFACT_DIGEST = "sha256:535b105275e9986ae15a6b59f532a92fd43bf50ef8f8772af95fe17ca84938ab" as const;
export const RECIPE_CARD_ARTIFACT_SIZE = 3_482 as const;

export const RECIPE_COMPONENTS = Object.freeze({
  card: "recipe.layout.card",
  title: "recipe.component.title",
  meta: "recipe.component.meta",
  sectionTitle: "recipe.component.section-title",
  ingredient: "recipe.component.ingredient",
  step: "recipe.component.step",
  servings: "recipe.component.servings",
  favorite: "recipe.component.favorite",
} as const);

export const RECIPE_COMPONENT_CATALOG = Object.freeze({
  version: "1" as const,
  id: "recipe.card.components",
  brandId: "recipe.brand",
  components: Object.freeze([
    Object.freeze({
      ref: RECIPE_COMPONENTS.card,
      label: "Recipe card",
      category: "recipe.layout",
      kind: "layout",
      props: Object.freeze([]),
      slots: Object.freeze([
        Object.freeze({ name: "header", label: "Header" }),
        Object.freeze({ name: "body", label: "Body" }),
        Object.freeze({ name: "footer", label: "Footer" }),
      ]),
      events: Object.freeze([]),
    }),
    Object.freeze({
      ref: RECIPE_COMPONENTS.title,
      label: "Recipe title",
      category: "recipe.content",
      kind: "content",
      props: Object.freeze([
        Object.freeze({ key: "text", type: "string", required: true, bindable: true }),
      ]),
      slots: Object.freeze([]),
      events: Object.freeze([]),
    }),
    Object.freeze({
      ref: RECIPE_COMPONENTS.meta,
      label: "Recipe meta",
      category: "recipe.content",
      kind: "content",
      props: Object.freeze([
        Object.freeze({ key: "servings", type: "number", required: true, bindable: true }),
        Object.freeze({ key: "time", type: "string", required: true, bindable: true }),
        Object.freeze({ key: "difficulty", type: "enum", required: true, bindable: true, options: Object.freeze(["easy", "medium", "hard"]) }),
      ]),
      slots: Object.freeze([]),
      events: Object.freeze([]),
    }),
    Object.freeze({
      ref: RECIPE_COMPONENTS.sectionTitle,
      label: "Recipe section title",
      category: "recipe.content",
      kind: "content",
      props: Object.freeze([
        Object.freeze({ key: "text", type: "string", required: true, bindable: false }),
      ]),
      slots: Object.freeze([]),
      events: Object.freeze([]),
    }),
    Object.freeze({
      ref: RECIPE_COMPONENTS.ingredient,
      label: "Ingredient",
      category: "recipe.collection",
      kind: "content",
      props: Object.freeze([
        Object.freeze({ key: "amount", type: "string", required: true, bindable: true }),
        Object.freeze({ key: "name", type: "string", required: true, bindable: true }),
      ]),
      slots: Object.freeze([]),
      events: Object.freeze([]),
    }),
    Object.freeze({
      ref: RECIPE_COMPONENTS.step,
      label: "Recipe step",
      category: "recipe.collection",
      kind: "content",
      props: Object.freeze([
        Object.freeze({ key: "index", type: "number", required: true, bindable: true }),
        Object.freeze({ key: "text", type: "string", required: true, bindable: true }),
      ]),
      slots: Object.freeze([]),
      events: Object.freeze([]),
    }),
    Object.freeze({
      ref: RECIPE_COMPONENTS.servings,
      label: "Servings control",
      category: "recipe.action",
      kind: "input",
      props: Object.freeze([
        Object.freeze({ key: "value", type: "number", required: true, bindable: true }),
      ]),
      slots: Object.freeze([]),
      events: Object.freeze([
        Object.freeze({ name: "decrease", label: "Decrease servings" }),
        Object.freeze({ name: "increase", label: "Increase servings" }),
      ]),
    }),
    Object.freeze({
      ref: RECIPE_COMPONENTS.favorite,
      label: "Favorite recipe",
      category: "recipe.action",
      kind: "action",
      props: Object.freeze([
        Object.freeze({ key: "active", type: "boolean", required: true, bindable: true }),
      ]),
      slots: Object.freeze([]),
      events: Object.freeze([
        Object.freeze({ name: "toggle", label: "Toggle favorite" }),
      ]),
    }),
  ]),
});

export const RECIPE_BINDING_SOURCE_CATALOG = Object.freeze({
  version: "1" as const,
  id: "recipe.card.data",
  sources: Object.freeze([
    Object.freeze({ kind: "domain" as const, path: "recipe.title", label: "Recipe · title", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "recipe.cook-time", label: "Recipe · cook time", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "recipe.difficulty", label: "Recipe · difficulty", valueType: "enum" as const }),
    Object.freeze({ kind: "domain" as const, path: "recipe.ingredients", label: "Recipe · ingredients", valueType: "array" as const }),
    Object.freeze({ kind: "domain" as const, path: "recipe.steps", label: "Recipe · steps", valueType: "array" as const }),
    Object.freeze({ kind: "state" as const, path: "servings", label: "Recipe · servings", valueType: "number" as const }),
    Object.freeze({ kind: "state" as const, path: "favorite", label: "Recipe · favorite", valueType: "boolean" as const }),
    Object.freeze({ kind: "scope" as const, path: "currentItem.amount", label: "Ingredient · amount", valueType: "string" as const }),
    Object.freeze({ kind: "scope" as const, path: "currentItem.name", label: "Ingredient · name", valueType: "string" as const }),
    Object.freeze({ kind: "scope" as const, path: "currentItem.index", label: "Step · index", valueType: "number" as const }),
    Object.freeze({ kind: "scope" as const, path: "currentItem.text", label: "Step · text", valueType: "string" as const }),
  ]),
});

export const RECIPE_ACTION_ADAPTER = Object.freeze({
  version: "1" as const,
  id: "recipe.card.actions",
  mappings: Object.freeze([
    Object.freeze({ event: "recipe.servings.decrease", actionType: "recipe.servings.decrease" }),
    Object.freeze({ event: "recipe.servings.increase", actionType: "recipe.servings.increase" }),
    Object.freeze({ event: "recipe.favorite.toggle", actionType: "recipe.favorite.toggle" }),
  ]),
});

export const RECIPE_PERMISSION_POLICY = Object.freeze({
  version: "1" as const,
  rules: Object.freeze(RECIPE_ACTION_ADAPTER.mappings.map((mapping) => Object.freeze({
    subject: "action" as const,
    id: mapping.actionType,
    effect: "allow" as const,
  }))),
});

const document: StudioAuthoringDocumentInput = {
  id: "vira.recipe-card.publication",
  recipeId: "studio.recipe.card",
  entryView: "main",
  views: [{
    id: "main",
    nodes: [
      { id: "card", component: RECIPE_COMPONENTS.card, order: 0, props: {} },
      { id: "title", component: RECIPE_COMPONENTS.title, parentId: "card", slot: "header", order: 0, props: {} },
      { id: "meta", component: RECIPE_COMPONENTS.meta, parentId: "card", slot: "header", order: 1, props: {} },
      { id: "ingredients-title", component: RECIPE_COMPONENTS.sectionTitle, parentId: "card", slot: "body", order: 0, props: { text: "Ingredients" } },
      { id: "ingredient", component: RECIPE_COMPONENTS.ingredient, parentId: "card", slot: "body", order: 1, props: {}, repeat: { source: { kind: "domain", path: "recipe.ingredients" } } },
      { id: "steps-title", component: RECIPE_COMPONENTS.sectionTitle, parentId: "card", slot: "body", order: 2, props: { text: "Steps" } },
      { id: "step", component: RECIPE_COMPONENTS.step, parentId: "card", slot: "body", order: 3, props: {}, repeat: { source: { kind: "domain", path: "recipe.steps" } } },
      { id: "servings", component: RECIPE_COMPONENTS.servings, parentId: "card", slot: "footer", order: 0, props: {} },
      { id: "favorite", component: RECIPE_COMPONENTS.favorite, parentId: "card", slot: "footer", order: 1, props: {} },
    ],
  }],
  bindings: [
    { viewId: "main", nodeId: "title", prop: "text", source: { kind: "domain", path: "recipe.title" } },
    { viewId: "main", nodeId: "meta", prop: "servings", source: { kind: "state", path: "servings" } },
    { viewId: "main", nodeId: "meta", prop: "time", source: { kind: "domain", path: "recipe.cook-time" } },
    { viewId: "main", nodeId: "meta", prop: "difficulty", source: { kind: "domain", path: "recipe.difficulty" } },
    { viewId: "main", nodeId: "ingredient", prop: "amount", source: { kind: "scope", path: "currentItem.amount" } },
    { viewId: "main", nodeId: "ingredient", prop: "name", source: { kind: "scope", path: "currentItem.name" } },
    { viewId: "main", nodeId: "step", prop: "index", source: { kind: "scope", path: "currentItem.index" } },
    { viewId: "main", nodeId: "step", prop: "text", source: { kind: "scope", path: "currentItem.text" } },
    { viewId: "main", nodeId: "servings", prop: "value", source: { kind: "state", path: "servings" } },
    { viewId: "main", nodeId: "favorite", prop: "active", source: { kind: "state", path: "favorite" } },
  ],
  interactions: [
    { viewId: "main", nodeId: "servings", event: "decrease", actionEvent: "recipe.servings.decrease", routes: [{ outcome: "success", viewId: "main" }] },
    { viewId: "main", nodeId: "servings", event: "increase", actionEvent: "recipe.servings.increase", routes: [{ outcome: "success", viewId: "main" }] },
    { viewId: "main", nodeId: "favorite", event: "toggle", actionEvent: "recipe.favorite.toggle", routes: [{ outcome: "success", viewId: "main" }] },
  ],
};

const publication = prepareAuthoredStudioPublication({
  document,
  componentCatalog: RECIPE_COMPONENT_CATALOG,
  bindingSourceCatalog: RECIPE_BINDING_SOURCE_CATALOG,
  actionAdapter: RECIPE_ACTION_ADAPTER,
});
if (!publication.ok) {
  throw new Error(`Invalid Recipe publication: ${publication.issue.path}: ${publication.issue.message}`);
}
export const RECIPE_CARD_PUBLICATION = publication.value;

const serializedPublication = JSON.stringify(RECIPE_CARD_PUBLICATION);
if (serializedPublication.length !== RECIPE_CARD_ARTIFACT_SIZE) {
  throw new Error("Recipe publication size drifted; regenerate Pack artifact metadata");
}

const pack = parseExperiencePackManifest({
  schemaVersion: "1",
  id: RECIPE_CARD_PACK_ID,
  version: RECIPE_CARD_PACK_VERSION,
  publisher: { id: "vira", name: "Vira" },
  metadata: {
    name: "Recipe Card",
    description: "Interactive recipe card with scalable ingredients, ordered steps, and saved state.",
    tags: ["food", "recipe"],
  },
  compatibility: { minViraVersion: "0.0.0" },
  entrypoints: [RECIPE_CARD_ENTRYPOINT],
  artifacts: [{
    id: RECIPE_CARD_ENTRYPOINT,
    role: "studio-publication",
    mediaType: "application/json",
    digest: RECIPE_CARD_ARTIFACT_DIGEST,
    size: RECIPE_CARD_ARTIFACT_SIZE,
  }],
});
if (!pack.ok) throw new Error(`Invalid Recipe Experience Pack: ${pack.issue.path}: ${pack.issue.message}`);
export const RECIPE_CARD_PACK_MANIFEST = pack.value;
