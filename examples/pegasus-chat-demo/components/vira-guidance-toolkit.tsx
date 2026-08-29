"use client";

import {
  createActionAdapterContract,
  createComponentAdapterContract,
} from "@vira-enterprise-genui/adapter-sdk";
import { composeExperience } from "@vira-enterprise-genui/composer";
import { planExperience } from "@vira-enterprise-genui/planner";
import {
  ViraExperience,
  type ViraExperienceHandle,
} from "@vira-enterprise-genui/react";
import type {
  RenderCapabilityBinding,
  RuntimeWebDomBeginContext,
  RuntimeWebDomPort,
  RuntimeWebDomRoot,
  ViraGenUI,
  ViraGenUIEventMap,
} from "@vira-enterprise-genui/runtime-web";
import { defineToolkit } from "@assistant-ui/react";
import { useMemo, useRef, useState } from "react";
import {
  isViraGuidanceResult,
  type ViraGuidanceExperience,
  type ViraGuidanceResult,
} from "../lib/vira-guidance-contract";

const capability = (id: string) => ({ version: "1" as const, id });

const componentAdapterResult = createComponentAdapterContract({
  version: "1",
  id: "airline.guidance.components",
  mappings: [
    { capability: capability("display-airline-guidance"), component: "airline.component.guidance" },
  ],
});
if (!componentAdapterResult.ok) throw new Error("Invalid airline guidance component adapter");
const componentAdapter = componentAdapterResult.value;

const actionAdapterResult = createActionAdapterContract({
  version: "1",
  id: "airline.guidance.actions",
  mappings: [
    { event: "assistance.select", actionType: "travel.guidance.assistance.select" },
    { event: "policy.select", actionType: "travel.guidance.policy.select" },
    { event: "visa.submit", actionType: "travel.guidance.visa.submit" },
    { event: "guidance.handoff", actionType: "travel.guidance.handoff" },
  ],
});
if (!actionAdapterResult.ok) throw new Error("Invalid airline guidance action adapter");
const actionAdapter = actionAdapterResult.value;

const permissionPolicy = {
  version: "1",
  rules: [
    { subject: "action", id: "travel.guidance.assistance.select", effect: "allow" },
    { subject: "action", id: "travel.guidance.policy.select", effect: "allow" },
    { subject: "action", id: "travel.guidance.visa.submit", effect: "allow" },
    { subject: "action", id: "travel.guidance.handoff", effect: "allow" },
    { subject: "action", id: "runtime.patch.apply", effect: "allow" },
  ],
} as const;

const capabilityAllowlist = {
  version: "1",
  allowed: ["display-airline-guidance"],
} as const;

const componentAllowlist = {
  version: "1",
  allowed: ["airline.component.guidance"],
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

const intentNameByExperience: Readonly<Record<ViraGuidanceExperience, string>> = Object.freeze({
  "advisory.special-assistance": "special-assistance",
  "policy.missed-flight": "missed-flight",
  "compliance.visa-check": "visa-check",
});

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = record(entry);
    return item ? [item] : [];
  });
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function buildGuidanceExperience(result: ViraGuidanceResult) {
  const name = intentNameByExperience[result.experience];
  const planned = planExperience({
    id: `airline-guidance-${name}`,
    intent: { version: "1", namespace: "travel.guidance", name },
    state: {
      "guidance-type": result.experience,
      "assistance-type": "",
      "policy-scenario": result.experience === "policy.missed-flight" ? "no-show" : "",
      "visa-status": "collecting",
      "guidance-handoff": "",
    },
    requiredState: ["guidance-type"],
    capabilityRequirements: [],
    availableCapabilities: [capability("display-airline-guidance")],
    futureCapabilities: [],
  });
  if (!planned.ok) return undefined;

  const composed = composeExperience({
    plan: planned.value,
    layout: { family: "flow" },
    disclosure: {
      primary: "immediate",
      supporting: "progressive",
      deferred: "on-demand",
    },
  });
  if (!composed.ok) return undefined;

  return {
    experienceId: `airline-guidance-${name}`,
    plan: planned.value,
    composition: composed.value,
  };
}

interface GuidanceController {
  readonly port: RuntimeWebDomPort;
  bindDispatch(dispatch: (event: unknown) => void): void;
  renderState(state: ViraGenUIEventMap["statechange"]): void;
  showError(message: string): void;
}

function createTextElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  value: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function createHeader(kicker: string, title: string, summary: string, chip: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const top = document.createElement("div");
  top.className = "guidance-top";
  const left = document.createElement("div");
  left.append(
    createTextElement("span", kicker, "guidance-kicker"),
    createTextElement("strong", title),
  );
  top.append(left, createTextElement("span", chip, "guidance-chip"));
  fragment.append(top, createTextElement("p", summary, "guidance-summary"));
  return fragment;
}

function appendList(parent: HTMLElement, values: readonly string[]): void {
  const list = document.createElement("ul");
  for (const value of values) list.append(createTextElement("li", value));
  parent.append(list);
}

function createGuidanceController(container: HTMLElement, result: ViraGuidanceResult): GuidanceController {
  let dispatch: (event: unknown) => void = () => undefined;
  let guidanceHost: HTMLElement | undefined;

  function mountGuidance(parent: HTMLElement): HTMLElement {
    const host = document.createElement("section");
    host.className = "vira-guidance";
    guidanceHost = host;
    parent.append(host);
    return host;
  }

  function mountBinding(parent: HTMLElement, binding: RenderCapabilityBinding): HTMLElement {
    if (binding.component === "airline.component.guidance") return mountGuidance(parent);
    throw new Error("Unsupported guidance component mapping");
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
          guidanceHost = undefined;
        },
      };
    },
  };

  function renderAssistance(state: ViraGenUIEventMap["statechange"]): void {
    if (!guidanceHost) return;
    guidanceHost.append(createHeader(
      "Special assistance",
      "Travel with mobility support",
      text(result.data.summary) ?? "Choose the assistance level that best matches the passenger's mobility needs.",
      "Action recommended",
    ));

    const highlight = document.createElement("div");
    highlight.className = "guidance-highlight";
    highlight.append(
      createTextElement("span", "When to request"),
      createTextElement("strong", text(result.data.deadline) ?? "Request as early as possible before departure"),
    );
    guidanceHost.append(highlight);

    const selected = text(state.plan.state["assistance-type"]);
    const grid = document.createElement("div");
    grid.className = "guidance-choice-grid assistance-grid";
    for (const item of records(result.data.types)) {
      const id = text(item.id);
      if (!id) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `guidance-choice${selected === id ? " selected" : ""}`;
      button.append(
        createTextElement("b", id),
        createTextElement("strong", text(item.title) ?? id),
        createTextElement("span", text(item.copy) ?? "Assistance option"),
      );
      button.addEventListener("click", () => {
        dispatch({ event: "assistance.select", payload: { assistanceType: id } });
      });
      grid.append(button);
    }
    guidanceHost.append(grid);

    const notes = document.createElement("div");
    notes.className = "guidance-notes";
    notes.append(createTextElement("strong", "Before you travel"));
    appendList(notes, strings(result.data.notes));
    guidanceHost.append(notes);

    const action = createTextElement(
      "button",
      selected ? `Continue with ${selected}` : "Choose an assistance type",
      "guidance-primary",
    );
    action.type = "button";
    action.disabled = !selected;
    action.addEventListener("click", () => {
      dispatch({ event: "guidance.handoff", payload: { kind: "special-assistance" } });
    });
    guidanceHost.append(action);

    if (text(state.plan.state["guidance-handoff"]) === "special-assistance") {
      guidanceHost.append(createTextElement(
        "div",
        "Assistance details are ready for an airline support/booking integration. No request has been submitted in this demo.",
        "guidance-handoff",
      ));
    }
  }

  function renderPolicy(state: ViraGenUIEventMap["statechange"]): void {
    if (!guidanceHost) return;
    guidanceHost.append(createHeader(
      "Travel policy",
      "If you miss your flight",
      text(result.data.summary) ?? "What happens depends on when and where the journey is interrupted.",
      "Scenario guide",
    ));

    const scenarios = records(result.data.scenarios);
    const selected = text(state.plan.state["policy-scenario"]) ?? text(scenarios[0]?.id) ?? "no-show";
    const tabs = document.createElement("div");
    tabs.className = "guidance-tabs";
    for (const scenario of scenarios) {
      const id = text(scenario.id);
      if (!id) continue;
      const button = createTextElement("button", text(scenario.label) ?? id);
      button.type = "button";
      button.className = selected === id ? "active" : "";
      button.addEventListener("click", () => dispatch({ event: "policy.select", payload: { scenario: id } }));
      tabs.append(button);
    }
    guidanceHost.append(tabs);

    const scenario = scenarios.find((item) => item.id === selected) ?? scenarios[0];
    if (scenario) {
      const panel = document.createElement("div");
      panel.className = "guidance-policy-panel";
      panel.append(createTextElement("strong", text(scenario.title) ?? "What happens"));
      appendList(panel, strings(scenario.points));
      const next = document.createElement("div");
      next.className = "guidance-next";
      next.append(
        createTextElement("span", "Best next step"),
        createTextElement("strong", text(scenario.nextAction) ?? "Check your current fare rules and contact the airline if needed."),
      );
      panel.append(next);
      guidanceHost.append(panel);
    }

    const actions = document.createElement("div");
    actions.className = "guidance-actions";
    const rules = createTextElement("button", "Check fare rules", "guidance-secondary");
    rules.type = "button";
    rules.addEventListener("click", () => dispatch({ event: "guidance.handoff", payload: { kind: "fare-rules" } }));
    const rebook = createTextElement("button", "Start a new flight search", "guidance-primary");
    rebook.type = "button";
    rebook.addEventListener("click", () => dispatch({ event: "guidance.handoff", payload: { kind: "new-search" } }));
    actions.append(rules, rebook);
    guidanceHost.append(actions);

    const handoff = text(state.plan.state["guidance-handoff"]);
    if (handoff) {
      guidanceHost.append(createTextElement(
        "div",
        handoff === "new-search"
          ? "A production host would open a new-search flow from here."
          : "A production host would resolve the selected ticket's live fare rules here.",
        "guidance-handoff",
      ));
    }
  }

  function renderVisa(state: ViraGenUIEventMap["statechange"]): void {
    if (!guidanceHost) return;
    const destination = result.input.destinationCountry || "your destination";
    guidanceHost.append(createHeader(
      "Entry requirements",
      `Check travel documents for ${destination}`,
      text(result.data.summary) ?? "Entry rules depend on the traveler's documents, not only the departure country.",
      "Official check required",
    ));

    if ((text(state.plan.state["visa-status"]) ?? "collecting") === "collecting") {
      const form = document.createElement("form");
      form.className = "guidance-visa-form";
      const route = document.createElement("div");
      route.className = "guidance-route";
      route.append(
        createTextElement("span", "Travel"),
        createTextElement("strong", `${result.input.originCountry || "Origin"} → ${destination}`),
      );
      form.append(route);

      const definitions = [
        ["nationality", "Nationality", result.input.nationality ?? "", "e.g. TUR"],
        ["passportIssuer", "Passport issued by", result.input.passportIssuer ?? "", "e.g. TR"],
        ["residence", "Country of residence", result.input.residence ?? "", "e.g. TUR"],
      ] as const;
      const inputs = new Map<string, HTMLInputElement>();
      for (const [name, labelText, initial, placeholder] of definitions) {
        const label = document.createElement("label");
        label.append(createTextElement("span", labelText));
        const input = document.createElement("input");
        input.name = name;
        input.value = initial;
        input.placeholder = placeholder;
        input.required = true;
        label.append(input);
        inputs.set(name, input);
        form.append(label);
      }

      const submit = createTextElement("button", "Prepare official visa check", "guidance-primary");
      submit.type = "submit";
      form.append(submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        dispatch({
          event: "visa.submit",
          payload: {
            nationality: inputs.get("nationality")?.value.trim() ?? "",
            passportIssuer: inputs.get("passportIssuer")?.value.trim() ?? "",
            residence: inputs.get("residence")?.value.trim() ?? "",
          },
        });
      });
      guidanceHost.append(form);
    } else {
      const profile = record(state.plan.state["visa-profile"]);
      const panel = document.createElement("div");
      panel.className = "guidance-visa-result";
      const status = document.createElement("div");
      status.className = "guidance-status-line";
      status.append(
        createTextElement("span", "Result"),
        createTextElement("strong", "Official verification required"),
      );
      panel.append(
        status,
        createTextElement(
          "p",
          "The demo collected the traveler context, but it has no authorized Timatic or immigration-rule API. It will not guess whether a visa is required.",
        ),
      );

      const facts = document.createElement("div");
      facts.className = "guidance-facts";
      const rows = [
        ["Nationality", text(profile?.nationality) ?? "—"],
        ["Passport issuer", text(profile?.passportIssuer) ?? "—"],
        ["Residence", text(profile?.residence) ?? "—"],
        ["Destination", destination],
      ] as const;
      for (const [labelText, valueText] of rows) {
        const row = document.createElement("div");
        row.append(createTextElement("span", labelText), createTextElement("strong", valueText));
        facts.append(row);
      }
      panel.append(facts);
      const verify = createTextElement("button", "Continue to official verification", "guidance-primary");
      verify.type = "button";
      verify.addEventListener("click", () => dispatch({ event: "guidance.handoff", payload: { kind: "visa-official" } }));
      panel.append(verify);
      guidanceHost.append(panel);
    }

    if (text(state.plan.state["guidance-handoff"]) === "visa-official") {
      guidanceHost.append(createTextElement(
        "div",
        "Official verification handoff is ready. No external visa database is connected in this demo.",
        "guidance-handoff",
      ));
    }
  }

  function renderState(state: ViraGenUIEventMap["statechange"]): void {
    if (!guidanceHost) return;
    guidanceHost.replaceChildren();
    if (result.experience === "advisory.special-assistance") renderAssistance(state);
    else if (result.experience === "policy.missed-flight") renderPolicy(state);
    else renderVisa(state);
  }

  function showError(message: string): void {
    container.replaceChildren(createTextElement("div", message, "flight-error"));
  }

  return {
    port,
    bindDispatch(next) { dispatch = next; },
    renderState,
    showError,
  };
}

function queuePatch(sdk: ViraGenUI, operations: readonly unknown[]): void {
  queueMicrotask(() => sdk.patch({ version: "1", operations }));
}

function GuidanceExperience({ result }: { result: ViraGuidanceResult }) {
  const handleRef = useRef<ViraExperienceHandle | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const controller = useMemo(
    () => container ? createGuidanceController(container, result) : undefined,
    [container, result],
  );
  const experience = useMemo(() => buildGuidanceExperience(result), [result]);
  const configuration = useMemo(() => {
    if (!controller) return undefined;
    let id = 0;
    return {
      componentAdapter,
      actionAdapter,
      permissionPolicy,
      capabilityAllowlist,
      componentAllowlist,
      accessibility,
      responsive,
      domPort: controller.port,
      idFactory: {
        nextId() {
          id += 1;
          return `airline-guidance-action-${id}`;
        },
      },
    };
  }, [controller]);

  if (!experience) return <div className="flight-error">Vira could not build this guidance experience.</div>;

  const handleEffect = (effect: ViraGenUIEventMap["effect"]) => {
    if (effect.type !== "host-action") return;
    const sdk = handleRef.current?.getSdk();
    if (!sdk) return;

    if (effect.action.type === "travel.guidance.assistance.select") {
      const assistanceType = text(effect.action.payload.assistanceType);
      if (!assistanceType) return;
      queuePatch(sdk, [
        { op: "set", path: "/state/assistance-type", value: assistanceType },
        { op: "set", path: "/state/guidance-handoff", value: "" },
      ]);
      return;
    }

    if (effect.action.type === "travel.guidance.policy.select") {
      const scenario = text(effect.action.payload.scenario);
      if (!scenario) return;
      queuePatch(sdk, [
        { op: "set", path: "/state/policy-scenario", value: scenario },
        { op: "set", path: "/state/guidance-handoff", value: "" },
      ]);
      return;
    }

    if (effect.action.type === "travel.guidance.visa.submit") {
      const nationality = text(effect.action.payload.nationality);
      const passportIssuer = text(effect.action.payload.passportIssuer);
      const residence = text(effect.action.payload.residence);
      if (!nationality || !passportIssuer || !residence) return;
      queuePatch(sdk, [
        { op: "set", path: "/state/visa-profile", value: { nationality, passportIssuer, residence } },
        { op: "set", path: "/state/visa-status", value: "official-check-required" },
        { op: "set", path: "/state/guidance-handoff", value: "" },
      ]);
      return;
    }

    if (effect.action.type === "travel.guidance.handoff") {
      const kind = text(effect.action.payload.kind);
      if (!kind) return;
      queuePatch(sdk, [{ op: "set", path: "/state/guidance-handoff", value: kind }]);
    }
  };

  return (
    <>
      <div
        ref={setContainer}
        className="vira-experience guidance-experience"
        aria-label="Interactive airline guidance"
      />
      {controller && configuration ? (
        <ViraExperience
          ref={handleRef}
          configuration={configuration}
          experience={experience}
          onReady={(sdk) => {
            controller.bindDispatch((event) => { sdk.dispatch(event); });
            const state = sdk.currentState();
            if (state) controller.renderState(state);
          }}
          onEffect={handleEffect}
          onStateChange={(state) => controller.renderState(state)}
          onConfigurationError={() => controller.showError("Vira guidance configuration could not be loaded.")}
          onMountResult={(mount) => {
            if (!mount.ok) controller.showError("Vira guidance could not be mounted.");
          }}
          onWrapperError={() => controller.showError("Vira guidance integration could not start.")}
          onError={() => controller.showError("Vira stopped this guidance experience safely.")}
        />
      ) : null}
    </>
  );
}

const guidanceToolkit = defineToolkit({
  vira_present_guidance: {
    type: "backend",
    display: "standalone",
    render: ({ result, status }) => {
      if (status.type === "running" || result === undefined) {
        return <div className="flight-loading">Preparing interactive guidance…</div>;
      }
      if (!isViraGuidanceResult(result)) {
        return <div className="flight-error">This Vira guidance experience could not be displayed.</div>;
      }
      return <GuidanceExperience result={result} />;
    },
  },
});

export default guidanceToolkit;
