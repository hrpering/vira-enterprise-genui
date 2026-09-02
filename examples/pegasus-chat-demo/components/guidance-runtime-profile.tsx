import type {
  ViraRuntimeCapabilityProfile,
  ViraRuntimeProfileContext,
  ViraRuntimeProfilePreparation,
} from "@vira-enterprise-genui/genui-resolver";
import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/genui";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { createRuntimeState } from "@vira-enterprise-genui/runtime-core";
import {
  AIRLINE_GUIDANCE_ACTION_ADAPTER,
  AIRLINE_GUIDANCE_BINDING_SOURCE_CATALOG,
  AIRLINE_GUIDANCE_COMPONENT,
  AIRLINE_GUIDANCE_COMPONENT_CATALOG,
  AIRLINE_GUIDANCE_PERMISSION_POLICY,
  AIRLINE_GUIDANCE_PUBLICATION,
} from "@vira-enterprise-genui/airline-brand-kit/guidance-publication";
import { useState, type FormEvent } from "react";

type GuidanceType =
  | "advisory.special-assistance"
  | "policy.missed-flight"
  | "compliance.visa-check";

interface GuidancePayload {
  readonly experience: GuidanceType;
  readonly input: Readonly<Record<string, string>>;
  readonly data: JsonObject;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function jsonRecord(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function records(value: JsonValue | undefined): JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const candidate = jsonRecord(entry);
    return candidate ? [candidate] : [];
  });
}

function strings(value: JsonValue | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function parseGuidancePayload(payload: JsonObject): GuidancePayload | undefined {
  const experience = payload.experience;
  if (
    experience !== "advisory.special-assistance"
    && experience !== "policy.missed-flight"
    && experience !== "compliance.visa-check"
  ) return undefined;
  const rawInput = jsonRecord(payload.input);
  const data = jsonRecord(payload.data);
  if (!rawInput || !data) return undefined;
  const input: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawInput)) {
    if (typeof value !== "string") return undefined;
    input[key] = value;
  }
  return Object.freeze({ experience, input: Object.freeze(input), data });
}

function Header({ kicker, title, summary, chip }: { kicker: string; title: string; summary: string; chip: string }) {
  return (
    <>
      <div className="guidance-top">
        <div><span className="guidance-kicker">{kicker}</span><strong>{title}</strong></div>
        <span className="guidance-chip">{chip}</span>
      </div>
      <p className="guidance-summary">{summary}</p>
    </>
  );
}

function AssistanceCard({ result, props, emit }: GuidanceCardProps) {
  const selected = text(props.assistanceType);
  return (
    <section className="vira-guidance">
      <Header
        kicker="Special assistance"
        title="Travel with mobility support"
        summary={text(result.data.summary) ?? "Choose the assistance level that best matches the passenger's mobility needs."}
        chip="Action recommended"
      />
      <div className="guidance-highlight">
        <span>When to request</span>
        <strong>{text(result.data.deadline) ?? "Request as early as possible before departure"}</strong>
      </div>
      <div className="guidance-choice-grid assistance-grid">
        {records(result.data.types).map((item) => {
          const id = text(item.id);
          if (!id) return null;
          return (
            <button
              key={id}
              type="button"
              className={`guidance-choice${selected === id ? " selected" : ""}`}
              onClick={() => { emit("assistance-select", { assistanceType: id }); }}
            >
              <b>{id}</b>
              <strong>{text(item.title) ?? id}</strong>
              <span>{text(item.copy) ?? "Assistance option"}</span>
            </button>
          );
        })}
      </div>
      <div className="guidance-notes">
        <strong>Before you travel</strong>
        <ul>{strings(result.data.notes).map((note) => <li key={note}>{note}</li>)}</ul>
      </div>
      <button
        type="button"
        className="guidance-primary"
        disabled={!selected}
        onClick={() => { emit("handoff", { kind: "special-assistance" }); }}
      >
        {selected ? `Continue with ${selected}` : "Choose an assistance type"}
      </button>
      {props.handoff === "special-assistance" ? (
        <div className="guidance-handoff">Assistance details are ready for an airline support/booking integration. No request has been submitted in this demo.</div>
      ) : null}
    </section>
  );
}

function PolicyCard({ result, props, emit }: GuidanceCardProps) {
  const scenarios = records(result.data.scenarios);
  const selected = text(props.policyScenario) ?? text(scenarios[0]?.id) ?? "no-show";
  const scenario = scenarios.find((item) => item.id === selected) ?? scenarios[0];
  return (
    <section className="vira-guidance">
      <Header
        kicker="Travel policy"
        title="If you miss your flight"
        summary={text(result.data.summary) ?? "What happens depends on when and where the journey is interrupted."}
        chip="Scenario guide"
      />
      <div className="guidance-tabs">
        {scenarios.map((item) => {
          const id = text(item.id);
          if (!id) return null;
          return (
            <button
              key={id}
              type="button"
              className={selected === id ? "active" : ""}
              onClick={() => { emit("policy-select", { scenario: id }); }}
            >{text(item.label) ?? id}</button>
          );
        })}
      </div>
      {scenario ? (
        <div className="guidance-policy-panel">
          <strong>{text(scenario.title) ?? "What happens"}</strong>
          <ul>{strings(scenario.points).map((point) => <li key={point}>{point}</li>)}</ul>
          <div className="guidance-next">
            <span>Best next step</span>
            <strong>{text(scenario.nextAction) ?? "Check your current fare rules and contact the airline if needed."}</strong>
          </div>
        </div>
      ) : null}
      <div className="guidance-actions">
        <button type="button" className="guidance-secondary" onClick={() => { emit("handoff", { kind: "fare-rules" }); }}>Check fare rules</button>
        <button type="button" className="guidance-primary" onClick={() => { emit("handoff", { kind: "new-search" }); }}>Start a new flight search</button>
      </div>
      {text(props.handoff) ? (
        <div className="guidance-handoff">
          {props.handoff === "new-search"
            ? "A production host would open a new-search flow from here."
            : "A production host would resolve the selected ticket's live fare rules here."}
        </div>
      ) : null}
    </section>
  );
}

function VisaCard({ result, props, emit }: GuidanceCardProps) {
  const destination = result.input.destinationCountry || "your destination";
  const [nationality, setNationality] = useState(result.input.nationality ?? "");
  const [passportIssuer, setPassportIssuer] = useState(result.input.passportIssuer ?? "");
  const [residence, setResidence] = useState(result.input.residence ?? "");
  const collecting = props.visaStatus !== "official-check-required";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    emit("visa-submit", {
      nationality: nationality.trim(),
      passportIssuer: passportIssuer.trim(),
      residence: residence.trim(),
    });
  };

  return (
    <section className="vira-guidance">
      <Header
        kicker="Entry requirements"
        title={`Check travel documents for ${destination}`}
        summary={text(result.data.summary) ?? "Entry rules depend on the traveler's documents, not only the departure country."}
        chip="Official check required"
      />
      {collecting ? (
        <form className="guidance-visa-form" onSubmit={submit}>
          <div className="guidance-route"><span>Travel</span><strong>{result.input.originCountry || "Origin"} → {destination}</strong></div>
          <label><span>Nationality</span><input required value={nationality} placeholder="e.g. TUR" onChange={(event) => setNationality(event.currentTarget.value)} /></label>
          <label><span>Passport issued by</span><input required value={passportIssuer} placeholder="e.g. TR" onChange={(event) => setPassportIssuer(event.currentTarget.value)} /></label>
          <label><span>Country of residence</span><input required value={residence} placeholder="e.g. TUR" onChange={(event) => setResidence(event.currentTarget.value)} /></label>
          <button type="submit" className="guidance-primary">Prepare official visa check</button>
        </form>
      ) : (
        <div className="guidance-visa-result">
          <div className="guidance-status-line"><span>Result</span><strong>Official verification required</strong></div>
          <p>The demo collected the traveler context, but it has no authorized Timatic or immigration-rule API. It will not guess whether a visa is required.</p>
          <div className="guidance-facts">
            <div><span>Nationality</span><strong>{text(props.nationality) ?? "—"}</strong></div>
            <div><span>Passport issuer</span><strong>{text(props.passportIssuer) ?? "—"}</strong></div>
            <div><span>Residence</span><strong>{text(props.residence) ?? "—"}</strong></div>
            <div><span>Destination</span><strong>{destination}</strong></div>
          </div>
          <button type="button" className="guidance-primary" onClick={() => { emit("handoff", { kind: "visa-official" }); }}>Continue to official verification</button>
        </div>
      )}
      {props.handoff === "visa-official" ? (
        <div className="guidance-handoff">Official verification handoff is ready. No external visa database is connected in this demo.</div>
      ) : null}
    </section>
  );
}

interface GuidanceCardProps {
  readonly result: GuidancePayload;
  readonly props: Readonly<Record<string, unknown>>;
  readonly emit: (event: string, payload: Record<string, string>) => void;
}

function GuidanceCard(input: GuidanceCardProps) {
  if (input.result.experience === "advisory.special-assistance") return <AssistanceCard {...input} />;
  if (input.result.experience === "policy.missed-flight") return <PolicyCard {...input} />;
  return <VisaCard {...input} />;
}

function runtimeState(experience: GuidanceType) {
  const result = createRuntimeState("airline-guidance", {
    version: "1",
    id: "airline-guidance-plan",
    intent: { version: "1", namespace: "travel.guidance", name: experience },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  if (!result.ok) throw new Error("Airline guidance runtime state could not be created");
  return result.value;
}

function actionType(input: unknown): { type?: string; payload?: Record<string, unknown> } {
  const action = record(input);
  return action
    ? { type: text(action.type), payload: record(action.payload) }
    : {};
}

function prepareGuidanceRuntime(context: ViraRuntimeProfileContext): ViraRuntimeProfilePreparation {
  const result = parseGuidancePayload(context.payload);
  if (!result) throw new Error("Airline guidance payload is invalid");

  let assistanceType = "";
  let policyScenario = result.experience === "policy.missed-flight" ? "no-show" : "";
  let visaStatus: "collecting" | "official-check-required" = "collecting";
  let nationality = result.input.nationality ?? "";
  let passportIssuer = result.input.passportIssuer ?? "";
  let residence = result.input.residence ?? "";
  let handoff = "";
  let revision = 1;

  const snapshot = () => ({
    version: "1" as const,
    revision,
    state: {
      "guidance-type": result.experience,
      "assistance-type": assistanceType,
      "policy-scenario": policyScenario,
      "visa-status": visaStatus,
      nationality,
      "passport-issuer": passportIssuer,
      residence,
      "guidance-handoff": handoff,
    },
    domain: {},
  });

  const host = {
    version: "1",
    id: "airline.guidance.host",
    snapshot,
    dispatch: async (input: unknown) => {
      const action = actionType(input);
      if (action.type === "travel.guidance.assistance.select") {
        const value = text(action.payload?.assistanceType);
        if (!value) return { outcome: "error" as const };
        assistanceType = value;
        handoff = "";
      } else if (action.type === "travel.guidance.policy.select") {
        const value = text(action.payload?.scenario);
        if (!value) return { outcome: "error" as const };
        policyScenario = value;
        handoff = "";
      } else if (action.type === "travel.guidance.visa.submit") {
        const nextNationality = text(action.payload?.nationality);
        const nextPassportIssuer = text(action.payload?.passportIssuer);
        const nextResidence = text(action.payload?.residence);
        if (!nextNationality || !nextPassportIssuer || !nextResidence) return { outcome: "error" as const };
        nationality = nextNationality;
        passportIssuer = nextPassportIssuer;
        residence = nextResidence;
        visaStatus = "official-check-required";
        handoff = "";
      } else if (action.type === "travel.guidance.handoff") {
        const kind = text(action.payload?.kind);
        if (!kind) return { outcome: "error" as const };
        handoff = kind;
      } else {
        return { outcome: "error" as const };
      }
      revision += 1;
      return { outcome: "success" as const, snapshot: snapshot() };
    },
    subscribe: () => () => {},
  };

  const renderer: StudioRuntimeReactRenderer = ({ props, emit }) => (
    <GuidanceCard
      result={result}
      props={props}
      emit={(event, payload) => { emit(event, payload); }}
    />
  );

  return Object.freeze({
    componentCatalog: AIRLINE_GUIDANCE_COMPONENT_CATALOG,
    bindingSourceCatalog: AIRLINE_GUIDANCE_BINDING_SOURCE_CATALOG,
    actionAdapter: AIRLINE_GUIDANCE_ACTION_ADAPTER,
    runtimeState: runtimeState(result.experience),
    permissionPolicy: AIRLINE_GUIDANCE_PERMISSION_POLICY,
    host,
    renderers: Object.freeze({ [AIRLINE_GUIDANCE_COMPONENT]: renderer }),
  });
}

export const AIRLINE_GUIDANCE_RUNTIME_PROFILE: ViraRuntimeCapabilityProfile = Object.freeze({
  id: "airline.guidance.runtime",
  componentRefs: AIRLINE_GUIDANCE_PUBLICATION.manifest.componentRefs,
  actionEvents: AIRLINE_GUIDANCE_PUBLICATION.manifest.actionEvents,
  bindingSources: AIRLINE_GUIDANCE_PUBLICATION.manifest.bindingSources,
  prepare: (context: ViraRuntimeProfileContext) => prepareGuidanceRuntime(context),
});
