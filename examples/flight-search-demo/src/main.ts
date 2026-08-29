import { resolveComponentForCapability } from "@vira-enterprise-genui/adapter-sdk";
import { composeExperience } from "@vira-enterprise-genui/composer";
import { planExperience } from "@vira-enterprise-genui/planner";
import { parseDomainData } from "@vira-enterprise-genui/protocol";
import { createViraGenUI } from "@vira-enterprise-genui/runtime-web";
import type {
  RenderCapabilityBinding,
  RuntimeWebDomBeginContext,
  RuntimeWebDomPort,
  RuntimeWebDomRoot,
  ViraGenUI,
  ViraGenUIEventMap,
} from "@vira-enterprise-genui/runtime-web";
import {
  createNetworkPolicy,
  evaluateNetworkRequest,
} from "@vira-enterprise-genui/security";
import { createTelemetryChannel } from "@vira-enterprise-genui/telemetry";
import type { TelemetryEvent } from "@vira-enterprise-genui/telemetry";
import {
  normalizeToolResultToDomainData,
  parseExternalToolResult,
} from "@vira-enterprise-genui/tool-bridge";

const capability = (id: string) => ({ version: "1" as const, id });

const componentAdapter = {
  version: "1",
  id: "demo.web.components",
  mappings: [
    { capability: capability("search-flights"), component: "demo.component.flight-search" },
    { capability: capability("edit-passengers"), component: "demo.component.passenger-editor" },
    { capability: capability("display.flight-results"), component: "demo.component.flight-results" },
  ],
} as const;

const actionAdapter = {
  version: "1",
  id: "demo.web.actions",
  mappings: [
    { event: "search.submit", actionType: "travel.flight.search.submit" },
    { event: "restricted.try", actionType: "travel.flight.restricted" },
  ],
} as const;

const permissionPolicy = {
  version: "1",
  rules: [
    { subject: "action", id: "travel.flight.search.submit", effect: "allow" },
    { subject: "action", id: "travel.flight.restricted", effect: "deny" },
    { subject: "action", id: "runtime.patch.apply", effect: "allow" },
  ],
} as const;

const capabilityAllowlist = {
  version: "1",
  allowed: ["search-flights", "edit-passengers", "display.flight-results"],
} as const;

const componentAllowlist = {
  version: "1",
  allowed: [
    "demo.component.flight-search",
    "demo.component.passenger-editor",
    "demo.component.flight-results",
  ],
} as const;

const accessibility = {
  version: "1",
  focusOnMount: "first-primary",
  focusOnUpdate: "primary-if-lost",
  statusAnnouncements: "polite",
  errorAnnouncements: "assertive",
} as const;

const responsive = {
  version: "1",
  strategy: "container",
  bands: [
    { id: "compact", minInlineSizePx: 0 },
    { id: "regular", minInlineSizePx: 560 },
  ],
} as const;

const flightNetworkPolicy = createNetworkPolicy({
  version: "1",
  rules: [{ origin: "https://api.example.com", methods: ["POST"] }],
});
if (!flightNetworkPolicy.ok) throw new Error("Demo network policy is invalid");

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing demo element: ${selector}`);
  return element;
}

const root = requiredElement<HTMLDivElement>("#experience-root");
const traceLog = requiredElement<HTMLDivElement>("#trace-log");
const statusLine = requiredElement<HTMLParagraphElement>("#status-line");
const modeBadge = requiredElement<HTMLSpanElement>("#mode-badge");
const deniedButton = requiredElement<HTMLButtonElement>("#deny-demo");
const clearTraceButton = requiredElement<HTMLButtonElement>("#clear-trace");

function trace(label: string, payload?: unknown): void {
  const row = document.createElement("div");
  row.className = "trace-row";
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString([], { hour12: false });
  const body = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = label;
  body.append(title);
  if (payload !== undefined) {
    const detail = document.createElement("pre");
    detail.textContent = JSON.stringify(payload, null, 2);
    body.append(detail);
  }
  row.append(time, body);
  traceLog.prepend(row);
}

function setStage(stage: "planner" | "composer" | "security" | "runtime", status: string): void {
  const element = requiredElement<HTMLElement>(`[data-stage="${stage}"]`);
  element.dataset.status = status;
  const state = element.querySelector<HTMLElement>("em");
  if (state) state.textContent = status;
}

function plannerInput() {
  return {
    id: "demo-travel-plan",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {
      origin: "IST",
      destination: "BER",
      "departure-date": "2026-09-03",
      passengers: 1,
    },
    requiredState: ["origin", "destination", "departure-date"],
    capabilityRequirements: [
      { field: "departure-date", capability: capability("select-date") },
    ],
    availableCapabilities: [capability("search-flights"), capability("edit-passengers")],
    futureCapabilities: [capability("display.flight-results")],
  };
}

interface SearchInput {
  readonly origin: string;
  readonly destination: string;
  readonly departureDate: string;
  readonly passengers: number;
}

interface DemoDomController {
  readonly port: RuntimeWebDomPort;
  bindDispatch(dispatch: (event: unknown) => void): void;
  setSearching(searching: boolean): void;
  renderRuntimeState(state: ViraGenUIEventMap["statechange"]): void;
}

function createDemoDomController(container: HTMLElement): DemoDomController {
  let dispatchUserEvent: (event: unknown) => void = () => undefined;
  let passengerCount = 1;
  let searchButton: HTMLButtonElement | undefined;
  let resultHost: HTMLElement | undefined;
  let statusHost: HTMLElement | undefined;

  function searchInput(scope: ParentNode): SearchInput {
    const origin = scope.querySelector<HTMLInputElement>("[name=origin]")?.value.trim().toUpperCase() ?? "IST";
    const destination = scope.querySelector<HTMLInputElement>("[name=destination]")?.value.trim().toUpperCase() ?? "BER";
    const departureDate = scope.querySelector<HTMLInputElement>("[name=departureDate]")?.value ?? "2026-09-03";
    return { origin, destination, departureDate, passengers: passengerCount };
  }

  function mountSearchComponent(parent: HTMLElement): HTMLElement {
    const card = document.createElement("form");
    card.className = "search-card";
    card.innerHTML = `
      <div class="route-grid">
        <label><span>From</span><input name="origin" value="IST" maxlength="3" autocomplete="off" aria-label="Origin airport" /></label>
        <div class="route-arrow" aria-hidden="true">→</div>
        <label><span>To</span><input name="destination" value="BER" maxlength="3" autocomplete="off" aria-label="Destination airport" /></label>
      </div>
      <label class="date-field"><span>Departure</span><input name="departureDate" type="date" value="2026-09-03" /></label>
      <button class="primary-button" type="submit"><span>Search flights</span><small>canonical host action</small></button>
    `;
    searchButton = card.querySelector<HTMLButtonElement>("button") ?? undefined;
    card.addEventListener("submit", (event) => {
      event.preventDefault();
      dispatchUserEvent({ event: "search.submit", payload: searchInput(card) });
    });
    parent.append(card);
    return card;
  }

  function mountPassengerComponent(parent: HTMLElement): HTMLElement {
    const card = document.createElement("div");
    card.className = "passenger-card";
    const label = document.createElement("div");
    label.innerHTML = "<span>Passengers</span><strong>1 adult</strong>";
    const controls = document.createElement("div");
    controls.className = "stepper";
    const decrement = document.createElement("button");
    decrement.type = "button";
    decrement.textContent = "−";
    const count = document.createElement("b");
    count.textContent = "1";
    const increment = document.createElement("button");
    increment.type = "button";
    increment.textContent = "+";
    controls.append(decrement, count, increment);
    card.append(label, controls);

    const sync = () => {
      count.textContent = String(passengerCount);
      const summary = label.querySelector("strong");
      if (summary) summary.textContent = `${passengerCount} adult${passengerCount === 1 ? "" : "s"}`;
      decrement.disabled = passengerCount <= 1;
    };
    decrement.addEventListener("click", () => {
      passengerCount = Math.max(1, passengerCount - 1);
      sync();
    });
    increment.addEventListener("click", () => {
      passengerCount = Math.min(8, passengerCount + 1);
      sync();
    });
    sync();
    parent.append(card);
    return card;
  }

  function mountResultsComponent(parent: HTMLElement): HTMLElement {
    const card = document.createElement("section");
    card.className = "results-card";
    const heading = document.createElement("div");
    heading.className = "results-heading";
    heading.innerHTML = "<div><span>Flight results</span><strong>Waiting for a host result</strong></div><b>DomainData</b>";
    statusHost = heading.querySelector("strong") ?? undefined;
    resultHost = document.createElement("div");
    resultHost.className = "flight-list empty-results";
    resultHost.textContent = "Run a search to send a canonical action across the host boundary.";
    card.append(heading, resultHost);
    parent.append(card);
    return card;
  }

  function appendFlightRow(parent: HTMLElement, flight: Record<string, unknown>): void {
    const carrier = typeof flight.carrier === "string" ? flight.carrier : "Carrier";
    const flightNumber = typeof flight.flightNumber === "string" ? flight.flightNumber : "—";
    const departure = typeof flight.departure === "string" ? flight.departure : "—";
    const arrival = typeof flight.arrival === "string" ? flight.arrival : "—";
    const duration = typeof flight.duration === "string" ? flight.duration : "—";
    const price = typeof flight.price === "number" ? flight.price : 0;
    const currency = typeof flight.currency === "string" ? flight.currency : "EUR";

    const row = document.createElement("article");
    row.className = "flight-row";
    const carrierBlock = document.createElement("div");
    carrierBlock.className = "carrier";
    const carrierMark = document.createElement("span");
    carrierMark.textContent = carrier.slice(0, 2).toUpperCase();
    const carrierText = document.createElement("div");
    const carrierName = document.createElement("strong");
    carrierName.textContent = carrier;
    const number = document.createElement("small");
    number.textContent = flightNumber;
    carrierText.append(carrierName, number);
    carrierBlock.append(carrierMark, carrierText);

    const times = document.createElement("div");
    times.className = "flight-time";
    const depart = document.createElement("strong");
    depart.textContent = departure;
    const durationText = document.createElement("span");
    durationText.textContent = duration;
    const arrive = document.createElement("strong");
    arrive.textContent = arrival;
    times.append(depart, durationText, arrive);

    const priceBlock = document.createElement("div");
    priceBlock.className = "price";
    const amount = document.createElement("strong");
    amount.textContent = `${price.toLocaleString("en-US")} ${currency}`;
    const priceNote = document.createElement("small");
    priceNote.textContent = "trip total";
    priceBlock.append(amount, priceNote);
    row.append(carrierBlock, times, priceBlock);
    parent.append(row);
  }

  function mountBinding(parent: HTMLElement, binding: RenderCapabilityBinding): HTMLElement {
    if (binding.component === "demo.component.flight-search") return mountSearchComponent(parent);
    if (binding.component === "demo.component.passenger-editor") return mountPassengerComponent(parent);
    if (binding.component === "demo.component.flight-results") return mountResultsComponent(parent);
    throw new Error("Unsupported demo component mapping");
  }

  const port: RuntimeWebDomPort = {
    measureContainerInlineSizePx() {
      const measured = container.getBoundingClientRect().width;
      return measured > 0 ? measured : 720;
    },
    begin(context: RuntimeWebDomBeginContext): RuntimeWebDomRoot {
      const fragment = document.createDocumentFragment();
      let committed = false;
      const mountedNodes: HTMLElement[] = [];
      return {
        createRegion(region) {
          const regionElement = document.createElement("section");
          regionElement.className = `experience-region region-${region.role}`;
          regionElement.dataset.region = region.id;
          fragment.append(regionElement);
          return {
            mountComponent(binding) {
              const node = mountBinding(regionElement, binding);
              mountedNodes.push(node);
              return { dispose() { node.remove(); } };
            },
          };
        },
        commit() {
          container.replaceChildren(fragment);
          committed = true;
          modeBadge.textContent = `${context.mode} · ${context.responsiveBand.id}`;
        },
        dispose() {
          for (const node of [...mountedNodes].reverse()) node.remove();
          if (committed) container.replaceChildren();
          searchButton = undefined;
          resultHost = undefined;
          statusHost = undefined;
        },
      };
    },
  };

  function renderRuntimeState(state: ViraGenUIEventMap["statechange"]): void {
    const raw = state.plan.state["flight-results"];
    if (raw === undefined) return;
    const parsed = parseDomainData(raw);
    if (!parsed.ok || !resultHost) return;
    const data = parsed.value.data;
    if (data === null || typeof data !== "object" || Array.isArray(data)) return;
    const flights = data.flights;
    if (!Array.isArray(flights)) return;

    resultHost.replaceChildren();
    resultHost.classList.remove("empty-results");
    if (statusHost) statusHost.textContent = `${flights.length} normalized options · revision ${state.revision}`;
    for (const rawFlight of flights) {
      if (rawFlight === null || typeof rawFlight !== "object" || Array.isArray(rawFlight)) continue;
      appendFlightRow(resultHost, rawFlight as Record<string, unknown>);
    }
  }

  return {
    port,
    bindDispatch(dispatch) { dispatchUserEvent = dispatch; },
    setSearching(searching) {
      if (searchButton) {
        searchButton.disabled = searching;
        const label = searchButton.querySelector("span");
        if (label) label.textContent = searching ? "Searching…" : "Search flights";
      }
      if (statusHost && searching) statusHost.textContent = "Host is executing the approved request…";
    },
    renderRuntimeState,
  };
}

function mockFlightResult(input: SearchInput): Record<string, unknown> {
  return {
    flights: [
      { id: "VF-101", carrier: "Vira Air", flightNumber: "VA 214", departure: "08:25", arrival: "10:05", duration: "2h 40m", price: 142 * input.passengers, currency: "EUR", origin: input.origin, destination: input.destination },
      { id: "VF-205", carrier: "Anatolia", flightNumber: "AN 772", departure: "12:10", arrival: "13:55", duration: "2h 45m", price: 167 * input.passengers, currency: "EUR", origin: input.origin, destination: input.destination },
      { id: "VF-318", carrier: "Northstar", flightNumber: "NS 318", departure: "18:40", arrival: "20:15", duration: "2h 35m", price: 193 * input.passengers, currency: "EUR", origin: input.origin, destination: input.destination },
    ],
    query: { origin: input.origin, destination: input.destination, departureDate: input.departureDate, passengers: input.passengers },
  };
}

const telemetry = createTelemetryChannel({
  exportBatch(events: readonly TelemetryEvent[]) {
    trace("Telemetry exporter received canonical batch", events.map((event) => event.name));
  },
  flush() { trace("Telemetry exporter flush"); },
  shutdown() { trace("Telemetry exporter shutdown"); },
});
if (!telemetry.ok) throw new Error("Demo telemetry exporter is invalid");

async function emitTelemetry(
  name: string,
  source: TelemetryEvent["source"],
  kind: TelemetryEvent["kind"],
  outcome: TelemetryEvent["outcome"],
): Promise<void> {
  const result = await telemetry.value.emit({ version: "1", name, source, kind, outcome, occurredAt: new Date().toISOString() });
  if (!result.ok) trace("Telemetry event rejected", result);
}

let sdk: ViraGenUI | undefined;
let requestSequence = 0;
const dom = createDemoDomController(root);

async function executeHostSearch(action: ViraGenUIEventMap["action"]): Promise<void> {
  if (action.type !== "travel.flight.search.submit") return;
  requestSequence += 1;
  const sequence = requestSequence;
  dom.setSearching(true);
  const input: SearchInput = {
    origin: typeof action.payload.origin === "string" ? action.payload.origin : "IST",
    destination: typeof action.payload.destination === "string" ? action.payload.destination : "BER",
    departureDate: typeof action.payload.departureDate === "string" ? action.payload.departureDate : "2026-09-03",
    passengers: typeof action.payload.passengers === "number" ? action.payload.passengers : 1,
  };

  trace("Host received canonical action", { id: action.id, type: action.type, payload: action.payload });
  await emitTelemetry("runtime.action.dispatched", "runtime-web", "action", "success");
  const network = evaluateNetworkRequest(flightNetworkPolicy.value, { url: "https://api.example.com/flights/search", method: "POST" });
  trace("Security evaluated host network target", network);
  if (!network.ok || network.value.decision !== "allow") {
    dom.setSearching(false);
    statusLine.textContent = "Network policy denied the host request.";
    await emitTelemetry("security.network.denied", "security", "security", "failure");
    return;
  }

  await emitTelemetry("security.network.allowed", "security", "security", "success");
  statusLine.textContent = "Approved host request executing…";
  await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
  if (sequence !== requestSequence) return;

  const hostNow = Date.now();
  const external = parseExternalToolResult({
    version: "1",
    tool: { kind: "function", name: "travel.flight.search" },
    outcome: "success",
    data: mockFlightResult(input),
    freshness: { observedAtUnixMs: hostNow, expiresAtUnixMs: hostNow + 300_000 },
  });
  trace("Tool Bridge parsed provider-neutral result", external);
  if (!external.ok) {
    dom.setSearching(false);
    statusLine.textContent = "Tool result was rejected by the canonical contract.";
    await emitTelemetry("tool.result.rejected", "tool-bridge", "integration", "failure");
    return;
  }

  const normalized = normalizeToolResultToDomainData(external.value, {
    version: "1",
    tool: { kind: "function", name: "travel.flight.search" },
    domain: "travel.flight",
    type: "results",
  });
  trace("Tool Bridge normalized DomainData", normalized);
  if (!normalized.ok || normalized.value.outcome !== "success") {
    dom.setSearching(false);
    statusLine.textContent = "Tool result could not be normalized.";
    await emitTelemetry("tool.result.rejected", "tool-bridge", "integration", "failure");
    return;
  }

  const canonicalDomainData = parseDomainData(normalized.value.domainData);
  if (!canonicalDomainData.ok) {
    dom.setSearching(false);
    statusLine.textContent = "Normalized DomainData failed canonical validation.";
    return;
  }

  await emitTelemetry("tool.result.normalized", "tool-bridge", "integration", "success");
  const patch = sdk?.patch({
    version: "1",
    operations: [
      { op: "set", path: "/state/origin", value: input.origin },
      { op: "set", path: "/state/destination", value: input.destination },
      { op: "set", path: "/state/departure-date", value: input.departureDate },
      { op: "set", path: "/state/passengers", value: input.passengers },
      { op: "set", path: "/state/flight-results", value: canonicalDomainData.value },
    ],
  });
  trace("Host applied canonical Runtime patch", patch);
  dom.setSearching(false);
  statusLine.textContent = patch?.ok ? "Canonical DomainData committed to Runtime state." : "Runtime rejected the host patch.";
}

function bindSdkEvents(instance: ViraGenUI): void {
  instance.on("action", (action) => trace("Runtime emitted canonical action", action));
  instance.on("effect", (effect) => {
    trace("Runtime emitted effect", effect);
    if (effect.type === "host-action") void executeHostSearch(effect.action);
  });
  instance.on("statechange", (state) => {
    trace("Runtime state changed", { revision: state.revision, planId: state.plan.id });
    dom.renderRuntimeState(state);
  });
  instance.on("error", (error) => trace("Runtime fail-closed error", error));
}

async function boot(): Promise<void> {
  trace("Host supplied intent + state", plannerInput());
  const planned = planExperience(plannerInput());
  if (!planned.ok) throw new Error("Planner rejected the demo input");
  setStage("planner", "ready");
  trace("Planner created ExperiencePlan", planned.value);

  const composed = composeExperience({
    plan: planned.value,
    layout: { family: "flow" },
    disclosure: { primary: "immediate", supporting: "progressive", deferred: "on-demand" },
  });
  if (!composed.ok) throw new Error("Composer rejected the demo plan");
  setStage("composer", "ready");
  trace("Composer created semantic regions", composed.value);

  const mapped = resolveComponentForCapability(componentAdapter, capability("search-flights"));
  if (!mapped.ok) throw new Error("Adapter SDK could not resolve the flight-search component");
  trace("Adapter SDK resolved brand component", mapped);
  setStage("security", "ready");

  let id = 0;
  const created = createViraGenUI({
    componentAdapter,
    actionAdapter,
    permissionPolicy,
    capabilityAllowlist,
    componentAllowlist,
    accessibility,
    responsive,
    domPort: dom.port,
    idFactory: { nextId() { id += 1; return `demo-action-${id}`; } },
  });
  if (!created.ok) throw new Error("Web SDK configuration failed");
  sdk = created.value;
  bindSdkEvents(sdk);
  dom.bindDispatch((event) => {
    const result = sdk?.dispatch(event);
    if (result && !result.ok) trace("Dispatch rejected", result);
  });

  const mounted = sdk.mount({ experienceId: "demo-flight-search-experience", plan: planned.value, composition: composed.value });
  if (!mounted.ok) throw new Error("Runtime Web mount failed");
  setStage("runtime", "mounted");
  modeBadge.textContent = `${composed.value.mode} · mounted`;
  statusLine.textContent = "Vira runtime mounted. Search uses an explicit host boundary.";
  trace("Runtime Web mounted brand components", mounted.value);
  await emitTelemetry("runtime.mount.completed", "runtime-web", "lifecycle", "success");
}

deniedButton.addEventListener("click", () => {
  const result = sdk?.dispatch({ event: "restricted.try", payload: {} });
  trace("Denied-action test", result);
  statusLine.textContent = result?.ok ? "Unexpected allow." : "Restricted action denied before host execution.";
});
clearTraceButton.addEventListener("click", () => traceLog.replaceChildren());
window.addEventListener("pagehide", () => {
  sdk?.dispose();
  void telemetry.value.shutdown();
});

void boot().catch((error: unknown) => {
  setStage("runtime", "failed");
  const message = error instanceof Error ? error.message : "Unknown demo failure";
  statusLine.textContent = message;
  trace("Demo boot failed", { message });
});
