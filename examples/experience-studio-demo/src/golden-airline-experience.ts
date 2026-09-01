import type {
  StudioBinding,
  StudioExperienceDocument,
  StudioInteraction,
  StudioNode,
  StudioView,
} from "@vira-enterprise-genui/studio-schema";
import { createStarterDocument } from "./catalog-v3.js";
import type { StarterTemplateId } from "./catalog-v3.js";

const BOOKING_STEPS = Object.freeze([
  "flight-search",
  "flight-results",
  "fare-comparison",
  "traveller-details",
  "seat-selection",
  "baggage",
  "extras",
  "booking-review",
] as const satisfies readonly StarterTemplateId[]);

function prefixNode(viewId: string, node: StudioNode): StudioNode {
  return {
    ...node,
    id: `${viewId}-${node.id}`,
    ...(node.parentId ? { parentId: `${viewId}-${node.parentId}` } : {}),
  };
}

function prefixBinding(viewId: string, binding: StudioBinding): StudioBinding {
  return {
    ...binding,
    viewId,
    nodeId: `${viewId}-${binding.nodeId}`,
  };
}

function prefixInteraction(
  viewId: string,
  nextViewId: string,
  interaction: StudioInteraction,
): StudioInteraction {
  return {
    ...interaction,
    viewId,
    nodeId: `${viewId}-${interaction.nodeId}`,
    routes: [{ outcome: "success", viewId: nextViewId }],
  };
}

function confirmationView(): StudioView {
  return {
    id: "confirmation",
    nodes: [
      {
        id: "confirmation-root",
        component: "airline.layout.stack",
        order: 0,
        props: { designgap: 12 },
      },
      {
        id: "confirmation-title",
        component: "airline.component.heading",
        parentId: "confirmation-root",
        slot: "content",
        order: 0,
        props: { text: "Booking ready", designfontsize: 30, designweight: "800" },
      },
      {
        id: "confirmation-copy",
        component: "airline.component.text",
        parentId: "confirmation-root",
        slot: "content",
        order: 1,
        props: { text: "The canonical Vira experience completed every guided booking step." },
      },
      {
        id: "confirmation-alert",
        component: "airline.status.alert",
        parentId: "confirmation-root",
        slot: "content",
        order: 2,
        props: { text: "Ready for the host checkout handoff.", tone: "success" },
      },
      {
        id: "confirmation-progress",
        component: "airline.status.progress",
        parentId: "confirmation-root",
        slot: "content",
        order: 3,
        props: { label: "Booking journey", value: 100 },
      },
    ],
  };
}

export function createGoldenAirlineExperience(experienceId = "airline.golden.booking"): StudioExperienceDocument {
  const views: StudioView[] = [];
  const bindings: StudioBinding[] = [];
  const interactions: StudioInteraction[] = [];

  for (let index = 0; index < BOOKING_STEPS.length; index += 1) {
    const step = BOOKING_STEPS[index];
    if (!step) continue;
    const source = createStarterDocument(`airline.golden.segment.${step}`, step);
    const sourceView = source.views.find((view) => view.id === source.entryView);
    if (!sourceView) throw new Error(`Golden booking starter ${step} has no entry view`);
    const nextViewId = BOOKING_STEPS[index + 1] ?? "confirmation";

    views.push({
      id: step,
      nodes: sourceView.nodes.map((node) => prefixNode(step, node)),
    });
    bindings.push(...source.bindings.map((binding) => prefixBinding(step, binding)));
    interactions.push(...source.interactions.map((interaction) => prefixInteraction(step, nextViewId, interaction)));
  }

  views.push(confirmationView());

  return {
    version: "1",
    id: experienceId,
    recipeId: "studio.airline.golden-booking",
    entryView: "flight-search",
    views,
    bindings,
    interactions,
  };
}

export const GOLDEN_AIRLINE_BOOKING_STEPS = Object.freeze([...BOOKING_STEPS, "confirmation"] as const);
