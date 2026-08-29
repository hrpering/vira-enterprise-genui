import type { JsonObject } from "@vira-enterprise-genui/protocol";
import type { ViraGenUIEventMap } from "@vira-enterprise-genui/runtime-web";
import {
  BAGGAGE_OPTIONS,
  baggageFeeForFare,
  EXTRA_OPTIONS,
  extraById,
  extraFeeForFare,
  FARE_OPTIONS,
  fareById,
  INSURANCE_OPTIONS,
  insuranceById,
  SEAT_OPTIONS,
  seatFeeForFare,
} from "./booking-catalog";
import type { ViraFlightExperienceResult } from "./vira-chat-contract";

type RuntimeState = ViraGenUIEventMap["statechange"];
type Dispatch = (event: unknown) => void;

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

function objectArray(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const object = objectValue(entry);
    return object ? [object] : [];
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function passengerCount(state: RuntimeState, seed: ViraFlightExperienceResult): number {
  const value = numberValue(state.plan.state.passengers);
  return value && Number.isInteger(value) ? Math.min(8, Math.max(1, value)) : seed.input.passengers;
}

function selectedOffer(offers: readonly JsonObject[], state: RuntimeState): JsonObject | undefined {
  const selectedId = textValue(state.plan.state["selected-offer"]);
  return selectedId ? offers.find((offer) => offer.id === selectedId) : undefined;
}

function totalPrice(state: RuntimeState): number {
  const fare = numberValue(state.plan.state["fare-total"]) ?? 0;
  const seats = objectArray(state.plan.state["seat-selections"])
    .reduce((sum, entry) => sum + (numberValue(entry.fee) ?? 0), 0);
  const baggage = objectArray(state.plan.state["baggage-selections"])
    .reduce((sum, entry) => sum + (numberValue(entry.fee) ?? 0), 0);
  const insurance = numberValue(state.plan.state["insurance-total"]) ?? 0;
  const extras = numberValue(state.plan.state["extras-total"]) ?? 0;
  return Math.round((fare + seats + baggage + insurance + extras) * 100) / 100;
}

function money(value: number, currency = "EUR"): string {
  return `${Math.round(value * 100) / 100} ${currency}`;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function flowHeader(state: RuntimeState, step: string, title: string, subtitle: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const shell = element("div", "vira-flow-top");
  const copy = element("div", "vira-flow-copy");
  const eyebrow = element("span", "vira-flow-eyebrow");
  eyebrow.textContent = "Your trip, assembled live";
  const heading = element("strong");
  heading.textContent = title;
  const description = element("p");
  description.textContent = subtitle;
  copy.append(eyebrow, heading, description);

  const total = element("div", "vira-live-total");
  const totalLabel = element("span");
  totalLabel.textContent = "Current total";
  const totalValue = element("strong");
  totalValue.textContent = money(totalPrice(state));
  total.append(totalLabel, totalValue);
  shell.append(copy, total);

  const rail = element("div", "vira-journey-rail");
  const steps = [
    ["fare", "Fare"],
    ["passengers", "Travellers"],
    ["seats", "Seats"],
    ["baggage", "Bags"],
    ["extras", "Extras"],
    ["review", "Review"],
  ] as const;
  const active = Math.max(0, steps.findIndex(([id]) => id === step));
  steps.forEach(([id, label], index) => {
    const item = element("div", `vira-journey-step${index <= active ? " active" : ""}${id === step ? " current" : ""}`);
    const dot = element("span");
    dot.textContent = index < active ? "✓" : String(index + 1);
    const text = element("b");
    text.textContent = label;
    item.append(dot, text);
    rail.append(item);
  });

  fragment.append(shell, rail);
  return fragment;
}

function renderFare(host: HTMLElement, state: RuntimeState, offer: JsonObject, seed: ViraFlightExperienceResult, dispatch: Dispatch): void {
  host.append(flowHeader(state, "fare", "Build the fare around your trip", "Compare what is actually included before you pay for extras later."));
  const count = passengerCount(state, seed);
  const base = numberValue(offer.price) ?? 0;
  const currency = textValue(offer.currency) ?? "EUR";

  const insight = element("div", "vira-insight-strip");
  insight.innerHTML = "<strong>Smart comparison</strong><span>Smart includes a cabin bag, 20kg checked baggage and a standard seat. For many trips it can cost less than adding those items to Light separately.</span>";
  host.append(insight);

  const grid = element("div", "vira-fare-grid rich");
  for (const fare of FARE_OPTIONS) {
    const card = element("button", `vira-fare-option${fare.id === "smart" ? " recommended" : ""}`);
    card.type = "button";
    const top = element("div", "vira-fare-option-top");
    const name = element("strong");
    name.textContent = fare.name;
    top.append(name);
    if (fare.badge) {
      const badge = element("span", "vira-option-badge");
      badge.textContent = fare.badge;
      top.append(badge);
    }
    const price = element("div", "vira-fare-price");
    const amount = element("strong");
    amount.textContent = money(base + fare.perPassengerExtra * count, currency);
    const small = element("span");
    small.textContent = fare.perPassengerExtra === 0 ? "base trip total" : `+${fare.perPassengerExtra} ${currency} / traveller`;
    price.append(amount, small);

    const list = element("ul", "vira-includes-list");
    for (const included of fare.includes) {
      const item = element("li");
      item.textContent = included;
      list.append(item);
    }
    const policy = element("p", "vira-fare-policy");
    policy.textContent = fare.changePolicy;
    card.append(top, price, list, policy);
    card.addEventListener("click", () => {
      dispatch({ event: "fare.select", payload: { fareId: fare.id } });
    });
    grid.append(card);
  }
  host.append(grid);
}

function passengerLabel(index: number): string {
  return index === 0 ? "Lead traveller" : `Traveller ${index + 1}`;
}

function renderPassengers(host: HTMLElement, state: RuntimeState, seed: ViraFlightExperienceResult, dispatch: Dispatch): void {
  host.append(flowHeader(state, "passengers", "Who is travelling?", "Passenger information stays inside the active Vira booking state until the airline handoff."));
  const count = passengerCount(state, seed);
  const form = element("form", "vira-traveller-form");
  const travellerInputs: Array<{ firstName: HTMLInputElement; lastName: HTMLInputElement; birthDate: HTMLInputElement }> = [];

  for (let index = 0; index < count; index += 1) {
    const card = element("section", "vira-traveller-card");
    const title = element("div", "vira-traveller-title");
    const number = element("span");
    number.textContent = String(index + 1);
    const heading = element("strong");
    heading.textContent = passengerLabel(index);
    title.append(number, heading);

    const grid = element("div", "vira-field-grid three");
    const firstName = element("input");
    firstName.required = true;
    firstName.autocomplete = "given-name";
    firstName.placeholder = "First name";
    const lastName = element("input");
    lastName.required = true;
    lastName.autocomplete = "family-name";
    lastName.placeholder = "Last name";
    const birthDate = element("input");
    birthDate.required = true;
    birthDate.type = "date";
    grid.append(firstName, lastName, birthDate);
    travellerInputs.push({ firstName, lastName, birthDate });
    card.append(title, grid);
    form.append(card);
  }

  const contact = element("section", "vira-contact-card");
  const contactTitle = element("strong");
  contactTitle.textContent = "Booking contact";
  const contactCopy = element("span");
  contactCopy.textContent = "Used for itinerary and disruption updates";
  const contactGrid = element("div", "vira-field-grid two");
  const email = element("input");
  email.type = "email";
  email.required = true;
  email.autocomplete = "email";
  email.placeholder = "Email";
  const phone = element("input");
  phone.type = "tel";
  phone.required = true;
  phone.autocomplete = "tel";
  phone.placeholder = "Phone";
  contactGrid.append(email, phone);
  contact.append(contactTitle, contactCopy, contactGrid);
  form.append(contact);

  const submit = element("button", "vira-primary-button");
  submit.type = "submit";
  submit.textContent = `Continue with ${count} traveller${count === 1 ? "" : "s"}`;
  form.append(submit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    dispatch({
      event: "passenger.submit",
      payload: {
        passengers: travellerInputs.map((inputs) => ({
          firstName: inputs.firstName.value.trim(),
          lastName: inputs.lastName.value.trim(),
          birthDate: inputs.birthDate.value,
        })),
        contact: { email: email.value.trim(), phone: phone.value.trim() },
      },
    });
  });
  host.append(form);
}

function renderSeats(host: HTMLElement, state: RuntimeState, seed: ViraFlightExperienceResult, dispatch: Dispatch): void {
  host.append(flowHeader(state, "seats", "Pick seats together", "Choose one seat per traveller. Prices reflect the selected fare."));
  const count = passengerCount(state, seed);
  const selections = objectArray(state.plan.state["seat-selections"]);
  const activePassenger = Math.min(count - 1, selections.length);
  const selectedIds = new Set(selections.flatMap((entry) => textValue(entry.seat) ? [textValue(entry.seat) as string] : []));
  const fareId = textValue(state.plan.state["fare-bundle"]);

  const bar = element("div", "vira-active-traveller");
  const avatar = element("span");
  avatar.textContent = `P${activePassenger + 1}`;
  const copy = element("div");
  const strong = element("strong");
  strong.textContent = selections.length >= count ? "All travellers have seats" : `Choose a seat for ${passengerLabel(activePassenger).toLowerCase()}`;
  const small = element("span");
  small.textContent = `${selections.length}/${count} assigned`;
  copy.append(strong, small);
  bar.append(avatar, copy);
  host.append(bar);

  const legend = element("div", "vira-seat-legend");
  legend.innerHTML = "<span><i class='front'></i>Front</span><span><i class='legroom'></i>Extra legroom</span><span><i></i>Standard</span><span><i class='occupied'></i>Occupied</span>";
  host.append(legend);

  const plane = element("div", "vira-plane");
  const nose = element("div", "vira-plane-nose");
  nose.textContent = "FRONT";
  plane.append(nose);
  const rows = Array.from(new Set(SEAT_OPTIONS.map((seat) => seat.row)));
  for (const rowNumber of rows) {
    const row = element("div", "vira-seat-row");
    const rowLabel = element("span", "vira-seat-row-number");
    rowLabel.textContent = String(rowNumber);
    row.append(rowLabel);
    const rowSeats = SEAT_OPTIONS.filter((seat) => seat.row === rowNumber);
    rowSeats.forEach((seat, index) => {
      if (index === 3) {
        const aisle = element("span", "vira-seat-aisle");
        aisle.textContent = "";
        row.append(aisle);
      }
      const button = element("button", `vira-seat ${seat.zone}${seat.occupied ? " occupied" : ""}${selectedIds.has(seat.id) ? " selected" : ""}`);
      button.type = "button";
      button.disabled = Boolean(seat.occupied || selectedIds.has(seat.id) || selections.length >= count);
      const code = element("strong");
      code.textContent = seat.id;
      const fee = element("span");
      const amount = seatFeeForFare(seat, fareId);
      fee.textContent = amount === 0 ? "incl." : `+${amount}`;
      button.append(code, fee);
      if (selectedIds.has(seat.id)) {
        const selected = selections.find((entry) => entry.seat === seat.id);
        const badge = element("b");
        badge.textContent = `P${(numberValue(selected?.passengerIndex) ?? 0) + 1}`;
        button.append(badge);
      }
      button.addEventListener("click", () => {
        dispatch({ event: "seat.select", payload: { passengerIndex: activePassenger, seat: seat.id } });
      });
      row.append(button);
    });
    plane.append(row);
  }
  host.append(plane);
}

function renderBaggage(host: HTMLElement, state: RuntimeState, seed: ViraFlightExperienceResult, dispatch: Dispatch): void {
  host.append(flowHeader(state, "baggage", "Pack for the trip you are actually taking", "Choose checked baggage per traveller or apply one choice to everybody."));
  const count = passengerCount(state, seed);
  const selections = objectArray(state.plan.state["baggage-selections"]);
  const activePassenger = Math.min(count - 1, selections.length);
  const fareId = textValue(state.plan.state["fare-bundle"]);

  const banner = element("div", "vira-active-traveller baggage");
  const avatar = element("span");
  avatar.textContent = `P${activePassenger + 1}`;
  const copy = element("div");
  const strong = element("strong");
  strong.textContent = `Bag for ${passengerLabel(activePassenger).toLowerCase()}`;
  const small = element("span");
  small.textContent = fareId === "smart" || fareId === "flex" ? "Up to 20kg is already included in your fare" : "No checked baggage is included in Light";
  copy.append(strong, small);
  banner.append(avatar, copy);
  host.append(banner);

  const grid = element("div", "vira-baggage-grid");
  for (const option of BAGGAGE_OPTIONS) {
    const card = element("div", "vira-bag-option");
    const kilo = element("strong");
    kilo.textContent = option.kilograms === 0 ? "Carry light" : `${option.kilograms} kg`;
    const label = element("span");
    label.textContent = option.label;
    const feeAmount = baggageFeeForFare(option, fareId);
    const fee = element("b");
    fee.textContent = feeAmount === 0 ? "Included" : `+${feeAmount} EUR`;
    const actions = element("div", "vira-bag-actions");
    const one = element("button");
    one.type = "button";
    one.textContent = `P${activePassenger + 1}`;
    one.addEventListener("click", () => dispatch({
      event: "baggage.select",
      payload: { passengerIndex: activePassenger, optionId: option.id },
    }));
    const all = element("button");
    all.type = "button";
    all.textContent = "All travellers";
    all.addEventListener("click", () => dispatch({
      event: "baggage.select",
      payload: { applyToAll: true, optionId: option.id },
    }));
    actions.append(one, all);
    card.append(kilo, label, fee, actions);
    grid.append(card);
  }
  host.append(grid);
}

function renderExtras(host: HTMLElement, state: RuntimeState, seed: ViraFlightExperienceResult, dispatch: Dispatch): void {
  host.append(flowHeader(state, "extras", "Protection and trip extras", "Nothing is pre-selected. Add only what is useful for this journey."));
  const count = passengerCount(state, seed);
  const fareId = textValue(state.plan.state["fare-bundle"]);
  let insuranceId = textValue(state.plan.state["insurance-id"]) ?? "none";
  const selectedExtras = new Set(stringArray(state.plan.state.extras));

  const sectionTitle = element("div", "vira-section-title");
  sectionTitle.innerHTML = "<strong>Travel protection</strong><span>Per traveller</span>";
  host.append(sectionTitle);
  const insuranceGrid = element("div", "vira-insurance-grid");
  const insuranceButtons = new Map<string, HTMLButtonElement>();
  const refreshInsurance = () => {
    insuranceButtons.forEach((button, id) => button.classList.toggle("selected", id === insuranceId));
  };
  for (const option of INSURANCE_OPTIONS) {
    const card = element("button", "vira-insurance-option");
    card.type = "button";
    const name = element("strong");
    name.textContent = option.name;
    const copy = element("span");
    copy.textContent = option.copy;
    const fee = element("b");
    fee.textContent = option.feePerPassenger === 0 ? "No charge" : `+${option.feePerPassenger * count} EUR`;
    card.append(name, copy, fee);
    card.addEventListener("click", () => {
      insuranceId = option.id;
      refreshInsurance();
    });
    insuranceButtons.set(option.id, card);
    insuranceGrid.append(card);
  }
  refreshInsurance();
  host.append(insuranceGrid);

  const extraTitle = element("div", "vira-section-title");
  extraTitle.innerHTML = "<strong>Make the airport easier</strong><span>Toggle any extras</span>";
  host.append(extraTitle);
  const extraGrid = element("div", "vira-extra-grid");
  for (const option of EXTRA_OPTIONS) {
    const card = element("button", `vira-extra-option${selectedExtras.has(option.id) ? " selected" : ""}`);
    card.type = "button";
    const name = element("strong");
    name.textContent = option.name;
    const copy = element("span");
    copy.textContent = option.copy;
    const fee = element("b");
    const amount = extraFeeForFare(option, fareId) * count;
    fee.textContent = amount === 0 ? "Included" : `+${amount} EUR`;
    card.append(name, copy, fee);
    card.addEventListener("click", () => {
      if (selectedExtras.has(option.id)) selectedExtras.delete(option.id);
      else selectedExtras.add(option.id);
      card.classList.toggle("selected", selectedExtras.has(option.id));
    });
    extraGrid.append(card);
  }
  host.append(extraGrid);

  const continueButton = element("button", "vira-primary-button");
  continueButton.type = "button";
  continueButton.textContent = "Review the whole trip";
  continueButton.addEventListener("click", () => {
    dispatch({ event: "extras.submit", payload: { insuranceId, extras: Array.from(selectedExtras) } });
  });
  host.append(continueButton);
}

function summaryRow(labelText: string, valueText: string): HTMLElement {
  const row = element("div", "vira-summary-row");
  const label = element("span");
  label.textContent = labelText;
  const value = element("strong");
  value.textContent = valueText;
  row.append(label, value);
  return row;
}

function renderReview(host: HTMLElement, state: RuntimeState, offer: JsonObject, seed: ViraFlightExperienceResult, dispatch: Dispatch): void {
  host.append(flowHeader(state, "review", "Everything in one place", "Review the complete trip before handing off to the airline checkout."));
  const currency = textValue(offer.currency) ?? "EUR";
  const passengers = objectArray(state.plan.state["passenger-details"]);
  const seats = objectArray(state.plan.state["seat-selections"]);
  const baggage = objectArray(state.plan.state["baggage-selections"]);
  const insurance = insuranceById(state.plan.state["insurance-id"]);
  const extras = stringArray(state.plan.state.extras).flatMap((id) => {
    const option = extraById(id);
    return option ? [option] : [];
  });
  const fare = fareById(state.plan.state["fare-bundle"]);

  const layout = element("div", "vira-review-layout");
  const main = element("div", "vira-review-main");
  const trip = element("section", "vira-review-section hero");
  const route = element("div", "vira-review-route");
  const routeText = element("div");
  const cities = element("strong");
  cities.textContent = `${textValue(offer.origin) ?? "—"} → ${textValue(offer.destination) ?? "—"}`;
  const flight = element("span");
  flight.textContent = `${textValue(offer.flightNumber) ?? "Flight"} · ${textValue(offer.departure) ?? "—"}–${textValue(offer.arrival) ?? "—"} · ${textValue(offer.duration) ?? ""}`;
  routeText.append(cities, flight);
  const farePill = element("span", "vira-fare-pill");
  farePill.textContent = fare?.name ?? "Fare";
  route.append(routeText, farePill);
  trip.append(route);
  main.append(trip);

  const travellerSection = element("section", "vira-review-section");
  const travellerHeading = element("strong");
  travellerHeading.textContent = "Travellers";
  travellerSection.append(travellerHeading);
  passengers.forEach((person, index) => {
    const seat = seats.find((entry) => entry.passengerIndex === index);
    const bag = baggage.find((entry) => entry.passengerIndex === index);
    travellerSection.append(summaryRow(
      `${textValue(person.firstName) ?? "Traveller"} ${textValue(person.lastName) ?? index + 1}`,
      `${textValue(seat?.seat) ?? "No seat"} · ${numberValue(bag?.kilograms) ?? 0}kg bag`,
    ));
  });
  main.append(travellerSection);

  const serviceSection = element("section", "vira-review-section");
  const serviceHeading = element("strong");
  serviceHeading.textContent = "Protection & extras";
  serviceSection.append(serviceHeading);
  serviceSection.append(summaryRow("Insurance", insurance?.name ?? "None"));
  serviceSection.append(summaryRow("Extras", extras.length > 0 ? extras.map((option) => option.name).join(", ") : "None"));
  main.append(serviceSection);

  const aside = element("aside", "vira-price-breakdown");
  const priceTitle = element("strong");
  priceTitle.textContent = "Price breakdown";
  aside.append(priceTitle);
  const fareTotal = numberValue(state.plan.state["fare-total"]) ?? numberValue(offer.price) ?? 0;
  const seatTotal = seats.reduce((sum, entry) => sum + (numberValue(entry.fee) ?? 0), 0);
  const bagTotal = baggage.reduce((sum, entry) => sum + (numberValue(entry.fee) ?? 0), 0);
  const insuranceTotal = numberValue(state.plan.state["insurance-total"]) ?? 0;
  const extrasTotal = numberValue(state.plan.state["extras-total"]) ?? 0;
  aside.append(
    summaryRow("Flight + fare", money(fareTotal, currency)),
    summaryRow("Seats", money(seatTotal, currency)),
    summaryRow("Baggage", money(bagTotal, currency)),
    summaryRow("Insurance", money(insuranceTotal, currency)),
    summaryRow("Extras", money(extrasTotal, currency)),
  );
  const grand = element("div", "vira-grand-total");
  const grandLabel = element("span");
  grandLabel.textContent = `Total for ${passengerCount(state, seed)} traveller${passengerCount(state, seed) === 1 ? "" : "s"}`;
  const grandValue = element("strong");
  grandValue.textContent = money(totalPrice(state), currency);
  grand.append(grandLabel, grandValue);
  aside.append(grand);

  const handoff = element("button", "vira-primary-button");
  handoff.type = "button";
  handoff.textContent = "Continue to secure payment";
  handoff.addEventListener("click", () => dispatch({ event: "booking.handoff", payload: {} }));
  aside.append(handoff);
  const boundary = element("p", "vira-payment-boundary-note");
  boundary.textContent = "This demo stops at the airline checkout boundary. It does not charge a card or create a real airline booking.";
  aside.append(boundary);
  layout.append(main, aside);
  host.append(layout);
}

function renderHandoff(host: HTMLElement, state: RuntimeState): void {
  host.append(flowHeader(state, "review", "Ready for airline checkout", "Vira completed the reservation configuration and produced a secure handoff payload."));
  const handoff = objectValue(state.plan.state["payment-handoff"]);
  const card = element("div", "vira-handoff-card");
  const mark = element("div", "vira-handoff-mark");
  mark.textContent = "→";
  const copy = element("div");
  const title = element("strong");
  title.textContent = "Checkout handoff is ready";
  const detail = element("p");
  const amount = numberValue(handoff?.amount) ?? totalPrice(state);
  const currency = textValue(handoff?.currency) ?? "EUR";
  detail.textContent = `${money(amount, currency)} · passenger, fare, seat, baggage, insurance and extras are assembled in the active Vira state.`;
  const note = element("span");
  note.textContent = "A production airline integration would now exchange this state for the airline's checkout/session token. No booking reference or payment is fabricated here.";
  copy.append(title, detail, note);
  card.append(mark, copy);
  host.append(card);
}

export function renderBookingFlow(
  host: HTMLElement,
  state: RuntimeState,
  offers: readonly JsonObject[],
  seed: ViraFlightExperienceResult,
  dispatch: Dispatch,
): void {
  host.replaceChildren();
  const offer = selectedOffer(offers, state);
  if (!offer) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const step = textValue(state.plan.state["booking-step"]) ?? "fare";
  if (step === "fare") renderFare(host, state, offer, seed, dispatch);
  else if (step === "passengers") renderPassengers(host, state, seed, dispatch);
  else if (step === "seats") renderSeats(host, state, seed, dispatch);
  else if (step === "baggage") renderBaggage(host, state, seed, dispatch);
  else if (step === "extras") renderExtras(host, state, seed, dispatch);
  else if (step === "review") renderReview(host, state, offer, seed, dispatch);
  else if (step === "handoff") renderHandoff(host, state);
}
