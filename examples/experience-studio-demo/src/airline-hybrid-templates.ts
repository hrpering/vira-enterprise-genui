import { AIRLINE_STUDIO_COMPONENTS } from "@vira-enterprise-genui/airline-brand-kit";
import {
  airlineStarterProps,
} from "@vira-enterprise-genui/airline-brand-kit/studio";
import type { AirlineStarterTemplateId } from "@vira-enterprise-genui/airline-brand-kit/studio";
import type {
  StudioExperienceDocument,
  StudioInteraction,
  StudioNode,
} from "@vira-enterprise-genui/studio-schema";

export const HYBRID_AIRLINE_TEMPLATE_IDS = Object.freeze([
  "flight-search",
  "fare-comparison",
  "traveller-details",
  "seat-selection",
  "baggage",
  "extras",
  "booking-review",
] as const satisfies readonly AirlineStarterTemplateId[]);

export type HybridAirlineTemplateId = (typeof HYBRID_AIRLINE_TEMPLATE_IDS)[number];

type HybridDefinition = Readonly<{
  component: string;
  heading: string;
  intro: string;
  notice: string;
  event: string;
  actionEvent: string;
}>;

const definitions: Readonly<Record<HybridAirlineTemplateId, HybridDefinition>> = Object.freeze({
  "flight-search": Object.freeze({
    component: AIRLINE_STUDIO_COMPONENTS.flightSearch,
    heading: "Search flights",
    intro: "Choose your route, travel date and passenger count.",
    notice: "Search fields remain a locked functional widget while surrounding copy and layout stay editable.",
    event: "submit",
    actionEvent: "flight.search.submit",
  }),
  "fare-comparison": Object.freeze({
    component: AIRLINE_STUDIO_COMPONENTS.fareComparison,
    heading: "Choose your fare",
    intro: "Compare Light, Smart and Flex before continuing.",
    notice: "Fare rules remain inside the trusted airline component; presentation around it is editable.",
    event: "select",
    actionEvent: "flight.fare.select",
  }),
  "traveller-details": Object.freeze({
    component: AIRLINE_STUDIO_COMPONENTS.travellerDetails,
    heading: "Traveller details",
    intro: "Add the passenger and booking-contact information required for this trip.",
    notice: "Sensitive form behavior stays inside the trusted functional component.",
    event: "submit",
    actionEvent: "flight.passenger.submit",
  }),
  "seat-selection": Object.freeze({
    component: AIRLINE_STUDIO_COMPONENTS.seatMap,
    heading: "Choose seats",
    intro: "Select a seat for each traveller using the fare-aware aircraft map.",
    notice: "Seat availability and fee logic remain locked; heading, supporting copy and layout are editable.",
    event: "select",
    actionEvent: "flight.seat.select",
  }),
  baggage: Object.freeze({
    component: AIRLINE_STUDIO_COMPONENTS.baggageSelector,
    heading: "Add baggage",
    intro: "Choose checked baggage per traveller.",
    notice: "Fare allowance and baggage fee rules remain inside the trusted selector.",
    event: "select",
    actionEvent: "flight.baggage.select",
  }),
  extras: Object.freeze({
    component: AIRLINE_STUDIO_COMPONENTS.extrasSelector,
    heading: "Insurance & extras",
    intro: "Add travel protection and optional trip services.",
    notice: "Product eligibility and pricing remain controlled by the trusted airline widget.",
    event: "submit",
    actionEvent: "flight.extras.submit",
  }),
  "booking-review": Object.freeze({
    component: AIRLINE_STUDIO_COMPONENTS.bookingReview,
    heading: "Review your trip",
    intro: "Check the itinerary, travellers and selected options before checkout.",
    notice: "Checkout handoff stays inside the trusted booking-review action surface.",
    event: "continue",
    actionEvent: "flight.booking.handoff",
  }),
});

export function isHybridAirlineTemplate(value: string): value is HybridAirlineTemplateId {
  return (HYBRID_AIRLINE_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function createHybridAirlineDocument(
  experienceId: string,
  template: HybridAirlineTemplateId,
): StudioExperienceDocument {
  const definition = definitions[template];
  const nodes: StudioNode[] = [
    {
      id: "root",
      component: "airline.layout.stack",
      order: 0,
      props: { designgap: 16 },
    },
    {
      id: "title",
      component: "airline.component.heading",
      parentId: "root",
      slot: "content",
      order: 0,
      props: { text: definition.heading, designfontsize: 30, designweight: "800" },
    },
    {
      id: "intro",
      component: "airline.component.text",
      parentId: "root",
      slot: "content",
      order: 1,
      props: { text: definition.intro },
    },
    {
      id: "widget-shell",
      component: "airline.layout.card",
      parentId: "root",
      slot: "content",
      order: 2,
      props: { variant: "default", designradius: 20, designpadding: 14 },
    },
    {
      id: "widget",
      component: definition.component,
      parentId: "widget-shell",
      slot: "content",
      order: 0,
      props: { ...airlineStarterProps(template) },
    },
    {
      id: "notice",
      component: "airline.component.text",
      parentId: "root",
      slot: "content",
      order: 3,
      props: { text: definition.notice, designfontsize: 12 },
    },
  ];

  const interactions: StudioInteraction[] = [{
    viewId: "main",
    nodeId: "widget",
    event: definition.event,
    actionEvent: definition.actionEvent,
    routes: [],
  }];

  return {
    version: "1",
    id: experienceId,
    recipeId: `studio.airline.${experienceId.replaceAll(".", "-")}`,
    entryView: "main",
    views: [{ id: "main", nodes }],
    bindings: [],
    interactions,
  };
}
