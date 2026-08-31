import type {
  StudioBinding,
  StudioExperienceDocument,
  StudioInteraction,
  StudioView,
} from "@vira-enterprise-genui/studio-schema";
import { createStarterDocument } from "./catalog-v4.js";
import type { StarterTemplateId } from "./catalog-v4.js";

const steps: readonly { readonly viewId: string; readonly template: StarterTemplateId }[] = [
  { viewId: "search", template: "flight-search" },
  { viewId: "results", template: "flight-results" },
  { viewId: "fare", template: "fare-comparison" },
  { viewId: "travellers", template: "traveller-details" },
  { viewId: "seats", template: "seat-selection" },
  { viewId: "baggage", template: "baggage" },
  { viewId: "extras", template: "extras" },
  { viewId: "review", template: "booking-review" },
];

function confirmationView(): StudioView {
  return {
    id: "confirmation",
    nodes: [
      { id: "root", component: "airline.layout.stack", order: 0, props: {} },
      {
        id: "title",
        component: "airline.component.heading",
        parentId: "root",
        slot: "content",
        order: 0,
        props: { text: "Booking ready" },
      },
      {
        id: "status",
        component: "airline.component.alert",
        parentId: "root",
        slot: "content",
        order: 1,
        props: { text: "The host can now complete the booking handoff.", tone: "success" },
      },
    ],
  };
}

export function createGoldenAirlineExperience(
  experienceId = "demo.golden.airline.booking",
): StudioExperienceDocument {
  const views: StudioView[] = [];
  const bindings: StudioBinding[] = [];
  const interactions: StudioInteraction[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    const nextViewId = steps[index + 1]?.viewId ?? "confirmation";
    const source = createStarterDocument(`${experienceId}.${step.viewId}`, step.template);
    const sourceView = source.views.find((view) => view.id === source.entryView);
    if (!sourceView) throw new Error(`Starter ${step.template} has no entry view`);

    views.push({ ...sourceView, id: step.viewId });
    bindings.push(...source.bindings
      .filter((binding) => binding.viewId === sourceView.id)
      .map((binding) => ({ ...binding, viewId: step.viewId })));
    interactions.push(...source.interactions
      .filter((interaction) => interaction.viewId === sourceView.id)
      .map((interaction) => ({
        ...interaction,
        viewId: step.viewId,
        routes: [{ outcome: "success" as const, viewId: nextViewId }],
      })));
  }

  views.push(confirmationView());
  return {
    version: "1",
    id: experienceId,
    recipeId: "studio.golden.airline.booking",
    entryView: "search",
    views,
    bindings,
    interactions,
  };
}
