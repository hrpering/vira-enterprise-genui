import "../../airline-brand-kit/styles/base.css";
import "../../airline-brand-kit/styles/booking-flow.css";
import "../../airline-brand-kit/styles/guidance.css";
import {
  DEFAULT_MOCK_RUNTIME_INPUT,
  FARE_OPTIONS,
  MOCK_AIRLINE_DATASET_VERSION,
  MOCK_AIRPORTS,
  createMockAirlineRuntimeData,
  listMockDestinations,
  type MockAirlineRuntimeInput,
  type MockFareId,
} from "@vira-enterprise-genui/mock-airline-domain";
import { planExperience } from "@vira-enterprise-genui/planner";
import { createRuntimeState } from "@vira-enterprise-genui/runtime-core";
import { createStudioRuntimeSession, type StudioRuntimeSession } from "@vira-enterprise-genui/studio-runtime";
import { renderStudioRuntimeReactView } from "@vira-enterprise-genui/studio-runtime-react";
import { createElement, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { readPublicExperience, type PublicExperience } from "./api.js";
import {
  actionAdapter,
  componentCatalog,
  runtimePermissionPolicy,
  runtimeRenderers,
} from "./catalog.js";
import { mockBindingSourceCatalog } from "./mock-bindings.js";

const panelStyle: CSSProperties = {
  margin: "18px auto 0",
  maxWidth: 1120,
  padding: "16px 18px",
  border: "1px solid rgba(18, 26, 47, 0.12)",
  borderRadius: 16,
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 12px 36px rgba(18,26,47,0.08)",
};

const controlsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginTop: 12,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 40,
  border: "1px solid rgba(18, 26, 47, 0.18)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "#fff",
  color: "#121a2f",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected Studio runtime error";
}

function freezeStudioSession(value: StudioRuntimeSession): StudioRuntimeSession {
  return Object.freeze(value);
}

function buildRuntime(
  publicExperience: PublicExperience,
  input: MockAirlineRuntimeInput,
  onHostCompletion: () => void,
): StudioRuntimeSession {
  const runtimeData = createMockAirlineRuntimeData(input);
  const planned = planExperience({
    id: `live-${publicExperience.id.replaceAll(".", "-")}`,
    intent: { version: "1", namespace: "studio.live", name: "published" },
    state: {},
    requiredState: [],
    capabilityRequirements: [],
    availableCapabilities: [],
    futureCapabilities: [],
  });
  if (!planned.ok) throw new Error(planned.issue.message);

  const runtimeState = createRuntimeState(`live-${publicExperience.id.replaceAll(".", "-")}`, planned.value);
  if (!runtimeState.ok) throw new Error(runtimeState.issue.message);

  let actionSequence = 0;
  const runtime = createStudioRuntimeSession({
    publication: publicExperience.publication,
    componentCatalog,
    bindingSourceCatalog: mockBindingSourceCatalog,
    actionAdapter,
    runtimeState: runtimeState.value,
    permissionPolicy: runtimePermissionPolicy,
  }, {
    data: {
      read(source) {
        if (source.kind !== "domain") return undefined;
        return runtimeData[source.path];
      },
    },
    actionIds: { nextId: () => `live-action-${++actionSequence}` },
  });
  if (!runtime.ok) throw new Error(runtime.issue.message);

  const session = runtime.value;
  return freezeStudioSession({
    currentViewId: () => session.currentViewId(),
    currentView: () => session.currentView(),
    currentRuntimeState: () => session.currentRuntimeState(),
    dispatch(eventInput) {
      const result = session.dispatch(eventInput);
      if (!result.ok) return result;
      const completion = session.complete({ actionId: result.value.action.id, outcome: "success" });
      if (!completion.ok) return { ok: false, stage: "studio", issue: completion.issue };
      onHostCompletion();
      return result;
    },
    applyHostPatch: (patch) => session.applyHostPatch(patch),
    complete: (completionInput) => session.complete(completionInput),
    dispose: () => session.dispose(),
  });
}

function DomainControls({
  input,
  onChange,
}: {
  readonly input: MockAirlineRuntimeInput;
  readonly onChange: (value: MockAirlineRuntimeInput) => void;
}): ReactElement {
  const destinations = listMockDestinations(input.origin);

  function setOrigin(origin: string): void {
    const nextDestinations = listMockDestinations(origin);
    const destination = nextDestinations.some((airport) => airport.code === input.destination)
      ? input.destination
      : nextDestinations[0]?.code ?? input.destination;
    onChange({ ...input, origin, destination });
  }

  return createElement(
    "section",
    { style: panelStyle, "data-testid": "mock-domain-controls" },
    createElement(
      "div",
      { style: { display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" } },
      createElement("strong", null, "Mock airline domain"),
      createElement("span", { style: { fontSize: 12, opacity: 0.65 } }, `dataset ${MOCK_AIRLINE_DATASET_VERSION} · shared with Chat tools`),
    ),
    createElement(
      "div",
      { style: controlsStyle },
      createElement(
        "label",
        { style: fieldStyle },
        "Origin",
        createElement(
          "select",
          {
            style: inputStyle,
            value: input.origin,
            "data-testid": "domain-origin",
            onChange: (event: { target: { value: string } }) => setOrigin(event.target.value),
          },
          ...MOCK_AIRPORTS.map((airport) => createElement("option", { key: airport.code, value: airport.code }, `${airport.city} (${airport.code})`)),
        ),
      ),
      createElement(
        "label",
        { style: fieldStyle },
        "Destination",
        createElement(
          "select",
          {
            style: inputStyle,
            value: input.destination,
            "data-testid": "domain-destination",
            onChange: (event: { target: { value: string } }) => onChange({ ...input, destination: event.target.value }),
          },
          ...destinations.map((airport) => createElement("option", { key: airport.code, value: airport.code }, `${airport.city} (${airport.code})`)),
        ),
      ),
      createElement(
        "label",
        { style: fieldStyle },
        "Departure",
        createElement("input", {
          style: inputStyle,
          type: "date",
          value: input.departureDate,
          "data-testid": "domain-departure",
          onChange: (event: { target: { value: string } }) => onChange({ ...input, departureDate: event.target.value }),
        }),
      ),
      createElement(
        "label",
        { style: fieldStyle },
        "Passengers",
        createElement("input", {
          style: inputStyle,
          type: "number",
          min: 1,
          max: 8,
          value: input.passengers,
          "data-testid": "domain-passengers",
          onChange: (event: { target: { value: string } }) => {
            const parsed = Number.parseInt(event.target.value, 10);
            onChange({ ...input, passengers: Number.isSafeInteger(parsed) ? Math.min(8, Math.max(1, parsed)) : 1 });
          },
        }),
      ),
      createElement(
        "label",
        { style: fieldStyle },
        "Fare",
        createElement(
          "select",
          {
            style: inputStyle,
            value: input.fare,
            "data-testid": "domain-fare",
            onChange: (event: { target: { value: string } }) => onChange({ ...input, fare: event.target.value as MockFareId }),
          },
          ...FARE_OPTIONS.map((fare) => createElement("option", { key: fare.id, value: fare.id }, fare.name)),
        ),
      ),
    ),
  );
}

function PublishedExperience({ value }: { readonly value: PublicExperience }): ReactElement {
  const [hostCompletions, setHostCompletions] = useState(0);
  const [input, setInput] = useState<MockAirlineRuntimeInput>({ ...DEFAULT_MOCK_RUNTIME_INPUT });

  const runtime = useMemo(
    () => buildRuntime(value, input, () => setHostCompletions((count) => count + 1)),
    [value.id, value.publishedAt, input.origin, input.destination, input.departureDate, input.passengers, input.fare],
  );
  useEffect(() => () => runtime.dispose(), [runtime]);

  const rendered = renderStudioRuntimeReactView({
    session: runtime,
    componentCatalog,
    renderers: runtimeRenderers,
  });
  if (!rendered.ok) {
    return createElement(
      "main",
      { className: "fatal-page" },
      createElement("h1", null, "Published runtime failed"),
      createElement("p", null, rendered.issue.message),
    );
  }

  return createElement(
    "main",
    { className: "live-page", "data-testid": "live-experience", "data-demo-host-completions": hostCompletions },
    createElement(
      "header",
      { className: "live-header" },
      createElement("div", null, createElement("span", { className: "live-dot" }), createElement("strong", null, value.name), createElement("code", null, value.id)),
      createElement("span", null, "Published Vira runtime · domain-bound"),
    ),
    createElement(DomainControls, { input, onChange: setInput }),
    createElement("section", { className: "live-canvas" }, rendered.value),
  );
}

function LiveApp({ id }: { readonly id: string }): ReactElement {
  const [value, setValue] = useState<PublicExperience>();
  const [notPublished, setNotPublished] = useState(false);
  const [issue, setIssue] = useState<string>();

  useEffect(() => {
    void readPublicExperience(id)
      .then((result) => {
        setValue(result);
        setNotPublished(false);
        setIssue(undefined);
      })
      .catch((error: unknown) => {
        const message = errorMessage(error);
        if (message.includes("not published")) setNotPublished(true);
        else setIssue(message);
      });
  }, [id]);

  if (notPublished) {
    return createElement(
      "main",
      { className: "live-missing", "data-testid": "live-not-published" },
      createElement("span", null, "404"),
      createElement("h1", null, "This experience is not published"),
      createElement("p", null, "The live publication was removed. The Studio draft may still exist."),
      createElement("a", { href: "/" }, "Open Experience Studio"),
    );
  }
  if (issue) return createElement("main", { className: "live-missing" }, createElement("h1", null, "Live experience failed"), createElement("p", null, issue));
  if (!value) return createElement("main", { className: "live-missing" }, "Loading published experience…");
  return createElement(PublishedExperience, { value });
}

const root = document.getElementById("root");
if (!root) throw new Error("demo root element missing");
const match = window.location.pathname.match(/^\/live\/([^/]+)$/);
if (!match) throw new Error("live data entry requires /live/<experience-id>");
createRoot(root).render(createElement(LiveApp, { id: decodeURIComponent(match[1] ?? "") }));
