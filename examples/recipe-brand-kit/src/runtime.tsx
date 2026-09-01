import type {
  ViraCommandAdapter,
  ViraCommandAdapterResult,
  ViraRuntimeCapabilityProfile,
  ViraRuntimeProfilePreparation,
} from "@vira-enterprise-genui/genui-resolver";
import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/genui";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { createRuntimeState } from "@vira-enterprise-genui/runtime-core";
import { createElement } from "react";
import {
  RECIPE_ACTION_ADAPTER,
  RECIPE_BINDING_SOURCE_CATALOG,
  RECIPE_CARD_PUBLICATION,
  RECIPE_COMPONENT_CATALOG,
  RECIPE_COMPONENTS,
  RECIPE_PERMISSION_POLICY,
} from "./publication.js";

export type RecipeDishId = "shakshuka" | "tomato-pasta" | "pancakes";

export interface RecipeToolInput {
  readonly dish: RecipeDishId;
  readonly servings: number;
}

interface IngredientSeed {
  readonly quantity: number;
  readonly unit: string;
  readonly name: string;
}

interface RecipeSeed {
  readonly title: string;
  readonly baseServings: number;
  readonly cookTime: string;
  readonly difficulty: "easy" | "medium" | "hard";
  readonly ingredients: readonly IngredientSeed[];
  readonly steps: readonly string[];
}

const RECIPE_LIBRARY: Readonly<Record<RecipeDishId, Omit<RecipeSeed, "baseServings">>> = Object.freeze({
  shakshuka: Object.freeze({
    title: "Shakshuka",
    cookTime: "30 min",
    difficulty: "easy",
    ingredients: Object.freeze([
      Object.freeze({ quantity: 1, unit: "tbsp", name: "olive oil" }),
      Object.freeze({ quantity: 0.5, unit: "", name: "onion, diced" }),
      Object.freeze({ quantity: 0.5, unit: "", name: "red pepper, diced" }),
      Object.freeze({ quantity: 1, unit: "clove", name: "garlic, minced" }),
      Object.freeze({ quantity: 200, unit: "g", name: "crushed tomatoes" }),
      Object.freeze({ quantity: 0.5, unit: "tsp", name: "ground cumin" }),
      Object.freeze({ quantity: 0.25, unit: "tsp", name: "smoked paprika" }),
      Object.freeze({ quantity: 1, unit: "", name: "egg" }),
    ]),
    steps: Object.freeze([
      "Soften the onion and pepper in olive oil over medium heat.",
      "Add garlic, cumin and paprika; cook until fragrant.",
      "Stir in tomatoes and simmer until the sauce thickens.",
      "Make wells in the sauce, crack in the eggs and cover until the whites set.",
      "Season and serve straight from the pan.",
    ]),
  }),
  "tomato-pasta": Object.freeze({
    title: "One-Pan Tomato Pasta",
    cookTime: "25 min",
    difficulty: "easy",
    ingredients: Object.freeze([
      Object.freeze({ quantity: 90, unit: "g", name: "spaghetti" }),
      Object.freeze({ quantity: 180, unit: "g", name: "chopped tomatoes" }),
      Object.freeze({ quantity: 0.5, unit: "clove", name: "garlic, sliced" }),
      Object.freeze({ quantity: 0.5, unit: "tbsp", name: "olive oil" }),
      Object.freeze({ quantity: 8, unit: "g", name: "parmesan" }),
      Object.freeze({ quantity: 3, unit: "leaf", name: "fresh basil" }),
    ]),
    steps: Object.freeze([
      "Add pasta, tomatoes, garlic and enough water to just cover the pasta to a wide pan.",
      "Bring to a lively simmer and stir frequently as the pasta cooks.",
      "When the pasta is al dente and the sauce is glossy, stir in olive oil.",
      "Finish with parmesan, basil and black pepper.",
    ]),
  }),
  pancakes: Object.freeze({
    title: "Fluffy Breakfast Pancakes",
    cookTime: "20 min",
    difficulty: "easy",
    ingredients: Object.freeze([
      Object.freeze({ quantity: 60, unit: "g", name: "plain flour" }),
      Object.freeze({ quantity: 0.5, unit: "tsp", name: "baking powder" }),
      Object.freeze({ quantity: 0.5, unit: "tbsp", name: "sugar" }),
      Object.freeze({ quantity: 0.25, unit: "", name: "egg" }),
      Object.freeze({ quantity: 75, unit: "ml", name: "milk" }),
      Object.freeze({ quantity: 0.5, unit: "tbsp", name: "melted butter" }),
    ]),
    steps: Object.freeze([
      "Whisk the flour, baking powder and sugar together.",
      "Whisk egg, milk and melted butter in a second bowl.",
      "Fold wet ingredients into dry ingredients just until combined.",
      "Cook small ladles of batter in a lightly greased pan until bubbles form, then flip.",
      "Serve warm with your preferred toppings.",
    ]),
  }),
});

export function createRecipePayload(input: RecipeToolInput): JsonObject {
  const definition = RECIPE_LIBRARY[input.dish];
  const servings = Number.isInteger(input.servings) ? Math.max(1, Math.min(12, input.servings)) : 4;
  return Object.freeze({
    recipe: Object.freeze({
      title: definition.title,
      baseServings: servings,
      cookTime: definition.cookTime,
      difficulty: definition.difficulty,
      ingredients: definition.ingredients,
      steps: definition.steps,
    }),
  });
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function requiredText(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function finiteNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseRecipePayload(payload: JsonObject): RecipeSeed | undefined {
  const raw = object(payload.recipe);
  if (!raw) return undefined;
  const title = requiredText(raw.title);
  const baseServings = typeof raw.baseServings === "number" && Number.isInteger(raw.baseServings)
    && raw.baseServings >= 1 && raw.baseServings <= 12 ? raw.baseServings : undefined;
  const cookTime = requiredText(raw.cookTime);
  const difficulty = raw.difficulty === "easy" || raw.difficulty === "medium" || raw.difficulty === "hard"
    ? raw.difficulty
    : undefined;
  if (!title || baseServings === undefined || !cookTime || !difficulty) return undefined;
  if (!Array.isArray(raw.ingredients) || raw.ingredients.length < 1 || raw.ingredients.length > 64) return undefined;
  if (!Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > 64) return undefined;

  const ingredients: IngredientSeed[] = [];
  for (const entry of raw.ingredients) {
    const item = object(entry);
    if (!item) return undefined;
    const quantity = finiteNumber(item.quantity);
    const unit = typeof item.unit === "string" ? item.unit.trim() : undefined;
    const name = requiredText(item.name);
    if (quantity === undefined || unit === undefined || !name) return undefined;
    ingredients.push(Object.freeze({ quantity, unit, name }));
  }

  const steps: string[] = [];
  for (const entry of raw.steps) {
    const step = requiredText(entry);
    if (!step) return undefined;
    steps.push(step);
  }
  return Object.freeze({
    title,
    baseServings,
    cookTime,
    difficulty,
    ingredients: Object.freeze(ingredients),
    steps: Object.freeze(steps),
  });
}

function quantityText(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}

function commandFailure(code: string, message: string): ViraCommandAdapterResult {
  return { ok: false, issue: Object.freeze({ code, path: "$.command", message }) };
}

function commandSuccess(): ViraCommandAdapterResult {
  return { ok: true };
}

const renderCard: StudioRuntimeReactRenderer = ({ slots }) => createElement(
  "article",
  {
    className: "vira-recipe-card",
    style: {
      display: "grid",
      gap: 18,
      padding: 24,
      border: "1px solid rgba(148, 163, 184, 0.28)",
      borderRadius: 24,
      background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(255,247,237,0.96))",
      boxShadow: "0 18px 48px rgba(15, 23, 42, 0.10)",
      color: "#172033",
    },
  },
  createElement("header", { style: { display: "grid", gap: 10 } }, ...(slots.header ?? [])),
  createElement("div", { style: { display: "grid", gap: 14 } }, ...(slots.body ?? [])),
  createElement("footer", {
    style: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", paddingTop: 6 },
  }, ...(slots.footer ?? [])),
);

const renderTitle: StudioRuntimeReactRenderer = ({ props }) => createElement(
  "h2",
  { style: { margin: 0, fontSize: "clamp(1.65rem, 4vw, 2.4rem)", lineHeight: 1.05, letterSpacing: "-0.035em" } },
  typeof props.text === "string" ? props.text : "Recipe",
);

const renderMeta: StudioRuntimeReactRenderer = ({ props }) => {
  const servings = typeof props.servings === "number" ? Math.round(props.servings) : 1;
  const time = typeof props.time === "string" ? props.time : "—";
  const difficulty = typeof props.difficulty === "string" ? props.difficulty : "easy";
  const pill = (text: string) => createElement("span", {
    style: { padding: "7px 10px", borderRadius: 999, background: "rgba(234,88,12,0.09)", fontSize: 13, fontWeight: 650 },
  }, text);
  return createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
    pill(`${servings} servings`), pill(time), pill(difficulty),
  );
};

const renderSectionTitle: StudioRuntimeReactRenderer = ({ props }) => createElement(
  "h3",
  { style: { margin: "8px 0 0", fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9a3412" } },
  typeof props.text === "string" ? props.text : "Section",
);

const renderIngredient: StudioRuntimeReactRenderer = ({ props }) => createElement(
  "div",
  { style: { display: "grid", gridTemplateColumns: "minmax(72px, auto) 1fr", gap: 12, alignItems: "baseline", padding: "7px 0", borderBottom: "1px solid rgba(148,163,184,0.18)" } },
  createElement("strong", { style: { color: "#c2410c" } }, typeof props.amount === "string" ? props.amount : "—"),
  createElement("span", null, typeof props.name === "string" ? props.name : "Ingredient"),
);

const renderStep: StudioRuntimeReactRenderer = ({ props }) => createElement(
  "div",
  { style: { display: "grid", gridTemplateColumns: "32px 1fr", gap: 12, alignItems: "start", padding: "7px 0" } },
  createElement("span", {
    style: { display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 999, background: "#ea580c", color: "white", fontWeight: 800, fontSize: 13 },
  }, typeof props.index === "number" ? Math.round(props.index) : "•"),
  createElement("p", { style: { margin: "3px 0 0", lineHeight: 1.55 } }, typeof props.text === "string" ? props.text : "Step"),
);

const renderServings: StudioRuntimeReactRenderer = ({ props, emit }) => {
  const value = typeof props.value === "number" ? Math.round(props.value) : 1;
  const buttonStyle = {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.45)",
    background: "white",
    fontSize: 18,
    cursor: "pointer",
  } as const;
  return createElement("div", {
    style: { display: "flex", alignItems: "center", gap: 9, padding: 6, borderRadius: 14, background: "rgba(255,255,255,0.72)" },
  },
  createElement("button", { type: "button", style: buttonStyle, disabled: value <= 1, onClick: () => { emit("decrease", {}); } }, "−"),
  createElement("strong", { style: { minWidth: 84, textAlign: "center" } }, `${value} servings`),
  createElement("button", { type: "button", style: buttonStyle, disabled: value >= 12, onClick: () => { emit("increase", {}); } }, "+"),
  );
};

const renderFavorite: StudioRuntimeReactRenderer = ({ props, emit }) => {
  const active = props.active === true;
  return createElement("button", {
    type: "button",
    onClick: () => { emit("toggle", {}); },
    "aria-pressed": active,
    style: {
      border: 0,
      borderRadius: 14,
      padding: "10px 14px",
      background: active ? "#7c2d12" : "#ffedd5",
      color: active ? "white" : "#9a3412",
      fontWeight: 750,
      cursor: "pointer",
    },
  }, active ? "♥ Saved" : "♡ Save recipe");
};

export const RECIPE_RUNTIME_RENDERERS: Readonly<Record<string, StudioRuntimeReactRenderer>> = Object.freeze({
  [RECIPE_COMPONENTS.card]: renderCard,
  [RECIPE_COMPONENTS.title]: renderTitle,
  [RECIPE_COMPONENTS.meta]: renderMeta,
  [RECIPE_COMPONENTS.sectionTitle]: renderSectionTitle,
  [RECIPE_COMPONENTS.ingredient]: renderIngredient,
  [RECIPE_COMPONENTS.step]: renderStep,
  [RECIPE_COMPONENTS.servings]: renderServings,
  [RECIPE_COMPONENTS.favorite]: renderFavorite,
});

function runtimeState() {
  const result = createRuntimeState("recipe-card", {
    version: "1",
    id: "recipe-card-plan",
    intent: { version: "1", namespace: "food.recipe", name: "view" },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  if (!result.ok) throw new Error("Recipe runtime state could not be created");
  return result.value;
}

function prepareRecipeRuntime(payload: JsonObject): ViraRuntimeProfilePreparation {
  const recipe = parseRecipePayload(payload);
  if (!recipe) throw new Error("Recipe payload is invalid");
  let servings = recipe.baseServings;
  let favorite = false;
  let revision = 1;

  const snapshot = () => ({
    version: "1" as const,
    revision,
    state: { servings, favorite },
    domain: {
      recipe: {
        title: recipe.title,
        "cook-time": recipe.cookTime,
        difficulty: recipe.difficulty,
        ingredients: recipe.ingredients.map((ingredient) => {
          const scaled = ingredient.quantity * servings / recipe.baseServings;
          const amount = `${quantityText(scaled)}${ingredient.unit ? ` ${ingredient.unit}` : ""}`;
          return { amount, name: ingredient.name };
        }),
        steps: recipe.steps.map((text, index) => ({ index: index + 1, text })),
      },
    },
  });

  const host = {
    version: "1",
    id: "recipe.card.host",
    snapshot,
    dispatch: async (action: unknown) => {
      if (action === null || typeof action !== "object" || Array.isArray(action)) return { outcome: "error" as const };
      const descriptor = Object.getOwnPropertyDescriptor(action, "type");
      const type = descriptor && "value" in descriptor ? descriptor.value : undefined;
      if (type === "recipe.servings.increase") {
        if (servings >= 12) return { outcome: "empty" as const, snapshot: snapshot() };
        servings += 1;
      } else if (type === "recipe.servings.decrease") {
        if (servings <= 1) return { outcome: "empty" as const, snapshot: snapshot() };
        servings -= 1;
      } else if (type === "recipe.favorite.toggle") {
        favorite = !favorite;
      } else {
        return { outcome: "error" as const };
      }
      revision += 1;
      return { outcome: "success" as const, snapshot: snapshot() };
    },
    subscribe: () => () => {},
  };

  const dispatch: ViraCommandAdapter = async ({ runtime, args }) => {
    const event = typeof args.event === "string" ? args.event : undefined;
    const nodeId = event === "toggle" ? "favorite" : "servings";
    if (event !== "increase" && event !== "decrease" && event !== "toggle") {
      return commandFailure("INVALID_VALUE", "Recipe command event is invalid");
    }
    const result = await runtime.controller.dispatch({ nodeId, event, payload: {} });
    return result.ok ? commandSuccess() : commandFailure("DISPATCH_REJECTED", "Recipe runtime rejected the command");
  };

  const commands: Readonly<Record<string, ViraCommandAdapter>> = Object.freeze({
    "increase-servings": (context) => dispatch({ ...context, args: { event: "increase" } }),
    "decrease-servings": (context) => dispatch({ ...context, args: { event: "decrease" } }),
    "toggle-favorite": (context) => dispatch({ ...context, args: { event: "toggle" } }),
  });

  return Object.freeze({
    componentCatalog: RECIPE_COMPONENT_CATALOG,
    bindingSourceCatalog: RECIPE_BINDING_SOURCE_CATALOG,
    actionAdapter: RECIPE_ACTION_ADAPTER,
    runtimeState: runtimeState(),
    permissionPolicy: RECIPE_PERMISSION_POLICY,
    host,
    renderers: RECIPE_RUNTIME_RENDERERS,
    commands,
  });
}

export const RECIPE_RUNTIME_PROFILE: ViraRuntimeCapabilityProfile = Object.freeze({
  id: "recipe.card.runtime",
  componentRefs: RECIPE_CARD_PUBLICATION.manifest.componentRefs,
  actionEvents: RECIPE_CARD_PUBLICATION.manifest.actionEvents,
  bindingSources: RECIPE_CARD_PUBLICATION.manifest.bindingSources,
  prepare: ({ payload }) => prepareRecipeRuntime(payload),
});
