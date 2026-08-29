import { parseDomainData, type JsonObject } from "@vira-enterprise-genui/protocol";
import type {
  RenderCapabilityBinding,
  RuntimeWebDomBeginContext,
  RuntimeWebDomPort,
  RuntimeWebDomRoot,
  ViraGenUIEventMap,
} from "@vira-enterprise-genui/runtime-web";
import { renderBookingFlow } from "./booking-renderer";
import type { ViraFlightExperienceResult } from "./vira-chat-contract";

export interface PegasusViraDomController {
  readonly port: RuntimeWebDomPort;
  bindDispatch(dispatch: (event: unknown) => void): void;
  renderState(state: ViraGenUIEventMap["statechange"]): void;
  showError(message: string): void;
}

function normalizeCode(value: string): string {
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : code.slice(0, 3);
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

export function createPegasusViraDomController(
  container: HTMLElement,
  seed: ViraFlightExperienceResult,
): PegasusViraDomController {
  let dispatch: (event: unknown) => void = () => undefined;
  let resultHost: HTMLElement | undefined;
  let statusHost: HTMLElement | undefined;
  let bookingHost: HTMLElement | undefined;

  function mountSearch(parent: HTMLElement): HTMLElement {
    const form = document.createElement("form");
    form.className = "vira-search-card";

    const route = document.createElement("div");
    route.className = "vira-route-grid";

    const originLabel = document.createElement("label");
    const originCaption = document.createElement("span");
    originCaption.textContent = "From";
    const origin = document.createElement("input");
    origin.name = "origin";
    origin.value = seed.data.offers[0]?.origin ?? normalizeCode(seed.input.origin);
    origin.maxLength = 3;
    origin.autocomplete = "off";
    originLabel.append(originCaption, origin);

    const arrow = document.createElement("div");
    arrow.className = "vira-route-arrow";
    arrow.textContent = "→";

    const destinationLabel = document.createElement("label");
    const destinationCaption = document.createElement("span");
    destinationCaption.textContent = "To";
    const destination = document.createElement("input");
    destination.name = "destination";
    destination.value = seed.data.offers[0]?.destination ?? normalizeCode(seed.input.destination);
    destination.maxLength = 3;
    destination.autocomplete = "off";
    destinationLabel.append(destinationCaption, destination);

    route.append(originLabel, arrow, destinationLabel);

    const details = document.createElement("div");
    details.className = "vira-search-details";

    const dateLabel = document.createElement("label");
    const dateCaption = document.createElement("span");
    dateCaption.textContent = "Departure";
    const date = document.createElement("input");
    date.type = "date";
    date.name = "departureDate";
    date.value = seed.input.departureDate;
    dateLabel.append(dateCaption, date);

    const passengersLabel = document.createElement("label");
    const passengersCaption = document.createElement("span");
    passengersCaption.textContent = "Passengers";
    const passengers = document.createElement("input");
    passengers.type = "number";
    passengers.name = "passengers";
    passengers.min = "1";
    passengers.max = "8";
    passengers.value = String(seed.input.passengers);
    passengersLabel.append(passengersCaption, passengers);

    details.append(dateLabel, passengersLabel);

    const search = document.createElement("button");
    search.type = "submit";
    search.className = "vira-primary-button";
    search.textContent = "Search flights";

    form.append(route, details, search);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const passengerCount = Number.parseInt(passengers.value, 10);
      dispatch({
        event: "search.submit",
        payload: {
          origin: normalizeCode(origin.value),
          destination: normalizeCode(destination.value),
          departureDate: date.value,
          passengers: Number.isSafeInteger(passengerCount)
            ? Math.min(8, Math.max(1, passengerCount))
            : 1,
        },
      });
    });

    parent.append(form);
    return form;
  }

  function mountResults(parent: HTMLElement): HTMLElement {
    const card = document.createElement("section");
    card.className = "vira-results-card";

    const head = document.createElement("div");
    head.className = "vira-results-head";
    const title = document.createElement("strong");
    title.textContent = "Available flights";
    statusHost = document.createElement("span");
    statusHost.textContent = "Loading options…";
    head.append(title, statusHost);

    resultHost = document.createElement("div");
    resultHost.className = "vira-flight-list";
    card.append(head, resultHost);
    parent.append(card);
    return card;
  }

  function mountBookingFlow(parent: HTMLElement): HTMLElement {
    const card = document.createElement("section");
    card.className = "vira-booking-flow";
    card.hidden = true;
    bookingHost = card;
    parent.append(card);
    return card;
  }

  function mountBinding(parent: HTMLElement, binding: RenderCapabilityBinding): HTMLElement {
    if (binding.component === "pegasus.component.flight-search") return mountSearch(parent);
    if (binding.component === "pegasus.component.flight-results") return mountResults(parent);
    if (binding.component === "pegasus.component.booking-flow") return mountBookingFlow(parent);
    throw new Error("Unsupported airline component mapping");
  }

  const port: RuntimeWebDomPort = {
    measureContainerInlineSizePx() {
      return container.getBoundingClientRect().width || 680;
    },
    begin(context: RuntimeWebDomBeginContext): RuntimeWebDomRoot {
      const fragment = document.createDocumentFragment();
      const nodes: HTMLElement[] = [];
      let committed = false;

      return {
        createRegion(region) {
          const regionElement = document.createElement("div");
          regionElement.className = `vira-region vira-region-${region.role}`;
          fragment.append(regionElement);
          return {
            mountComponent(binding) {
              const node = mountBinding(regionElement, binding);
              nodes.push(node);
              return { dispose() { node.remove(); } };
            },
          };
        },
        commit() {
          container.replaceChildren(fragment);
          container.dataset.mode = context.mode;
          committed = true;
        },
        dispose() {
          for (const node of [...nodes].reverse()) node.remove();
          if (committed) container.replaceChildren();
          resultHost = undefined;
          statusHost = undefined;
          bookingHost = undefined;
        },
      };
    },
  };

  function readOffers(state: ViraGenUIEventMap["statechange"]): JsonObject[] {
    const raw = state.plan.state["flight-results"];
    if (raw === undefined) return [];
    const parsed = parseDomainData(raw);
    if (!parsed.ok) return [];
    const data = objectValue(parsed.value.data);
    if (!data || !Array.isArray(data.offers)) return [];
    return data.offers.flatMap((offer) => {
      const object = objectValue(offer);
      return object ? [object] : [];
    });
  }

  function renderResults(state: ViraGenUIEventMap["statechange"], offers: readonly JsonObject[]): void {
    if (!resultHost) return;
    const selected = textValue(state.plan.state["selected-offer"]);
    const passengers = numberValue(state.plan.state.passengers) ?? seed.input.passengers;
    const prices = offers.map((offer) => numberValue(offer.price)).filter((value): value is number => value !== undefined);
    const cheapest = prices.length > 0 ? Math.min(...prices) : undefined;

    resultHost.replaceChildren();
    if (statusHost) statusHost.textContent = `${offers.length} options · total trip prices`;

    for (const offer of offers) {
      if (typeof offer.id !== "string") continue;
      const price = numberValue(offer.price) ?? 0;
      const row = document.createElement("article");
      row.className = `vira-flight-row${selected === offer.id ? " selected" : ""}`;

      const time = document.createElement("div");
      time.className = "vira-flight-time";
      const departure = document.createElement("strong");
      departure.textContent = typeof offer.departure === "string" ? offer.departure : "—";
      const route = document.createElement("span");
      const from = typeof offer.origin === "string" ? offer.origin : "—";
      const to = typeof offer.destination === "string" ? offer.destination : "—";
      route.textContent = `${from} → ${to}`;
      const arrival = document.createElement("strong");
      arrival.textContent = typeof offer.arrival === "string" ? offer.arrival : "—";
      time.append(departure, route, arrival);

      const meta = document.createElement("div");
      meta.className = "vira-flight-meta";
      const number = document.createElement("strong");
      number.textContent = typeof offer.flightNumber === "string" ? offer.flightNumber : "Flight";
      const duration = document.createElement("span");
      duration.textContent = typeof offer.duration === "string" ? offer.duration : "Direct";
      meta.append(number, duration);
      if (cheapest !== undefined && price === cheapest) {
        const badge = document.createElement("b");
        badge.className = "vira-flight-badge";
        badge.textContent = "Cheapest";
        meta.append(badge);
      }

      const priceBox = document.createElement("div");
      priceBox.className = "vira-flight-pricebox";
      const currency = typeof offer.currency === "string" ? offer.currency : "EUR";
      const perPerson = Math.round((price / Math.max(1, passengers)) * 100) / 100;
      const perPersonLabel = document.createElement("span");
      perPersonLabel.textContent = `${perPerson} ${currency} / person`;
      const action = document.createElement("button");
      action.type = "button";
      action.className = "vira-price-button";
      action.textContent = selected === offer.id ? "Selected" : `${price} ${currency}`;
      action.addEventListener("click", () => {
        dispatch({ event: "offer.select", payload: { offerId: offer.id } });
      });
      priceBox.append(perPersonLabel, action);

      row.append(time, meta, priceBox);
      resultHost.append(row);
    }
  }

  function renderState(state: ViraGenUIEventMap["statechange"]): void {
    const offers = readOffers(state);
    renderResults(state, offers);
    if (bookingHost) renderBookingFlow(bookingHost, state, offers, seed, dispatch);
  }

  function showError(message: string): void {
    const error = document.createElement("div");
    error.className = "flight-error";
    error.textContent = message;
    container.replaceChildren(error);
  }

  return {
    port,
    bindDispatch(next) { dispatch = next; },
    renderState,
    showError,
  };
}
