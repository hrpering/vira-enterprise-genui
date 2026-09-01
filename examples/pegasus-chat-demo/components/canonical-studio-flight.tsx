"use client";

import {
  AIRLINE_STUDIO_COMPONENTS,
  mountAirlineStudioComponent,
} from "@vira-enterprise-genui/airline-brand-kit";
import { AIRLINE_STARTER_TEMPLATES } from "@vira-enterprise-genui/airline-brand-kit/studio";
import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/genui";
import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { ViraFlightExperienceResult } from "../lib/vira-chat-contract";
import { registerCanonicalChatCommandTarget } from "./canonical-chat-command";
import { createCanonicalChatRuntime } from "./canonical-chat-runtime";

function AirlineWidget({ component, props, emit }: {
  readonly component: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly emit: (event: string, payload?: unknown) => unknown;
}): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    return mountAirlineStudioComponent(ref.current, component, props, (event, payload) => { emit(event, payload); });
  }, [component, props, emit]);
  return <div ref={ref} className="shared-brand-runtime" />;
}

const renderers: Readonly<Record<string, StudioRuntimeReactRenderer>> = Object.freeze(Object.fromEntries(
  Object.values(AIRLINE_STUDIO_COMPONENTS).map((component) => [
    component,
    ({ props, emit }: Parameters<StudioRuntimeReactRenderer>[0]) => createElement(AirlineWidget, { component, props, emit }),
  ]),
));

export function CanonicalStudioFlightExperience({ result }: { readonly result: ViraFlightExperienceResult }) {
  const bundle = useMemo(() => createCanonicalChatRuntime(result), [result]);
  const [, setRevision] = useState(0);
  useEffect(() => {
    if (!bundle) return undefined;
    const unregisterCommandTarget = registerCanonicalChatCommandTarget({
      runtime: bundle.runtime,
      offers: bundle.offers,
    });
    const unsubscribe = bundle.runtime.subscribe(() => { setRevision((value) => value + 1); });
    return () => {
      unregisterCommandTarget();
      unsubscribe();
      bundle.runtime.dispose();
    };
  }, [bundle]);

  if (!bundle) return <div className="flight-error">Vira could not load the approved GenUI publication.</div>;
  const rendered = bundle.runtime.renderReact({ renderers });
  if (!rendered.ok) return <div className="flight-error">Vira stopped this GenUI experience safely.</div>;
  return <div className="vira-experience" aria-label="Approved interactive flight booking">{rendered.value}</div>;
}

export const APPROVED_CHAT_EXPERIENCE_ID = "pegasus.chat.approved-booking" as const;
export const APPROVED_CHAT_STUDIO_TEMPLATES = AIRLINE_STARTER_TEMPLATES;
