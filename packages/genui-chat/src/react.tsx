"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { ViraResolvedExperience } from "@vira-enterprise-genui/genui-resolver";
import type { ViraChatBridge, ViraChatBridgeIssue, ViraChatBridgePresentResult } from "./bridge.js";

export interface ViraChatExperienceProps {
  readonly bridge: ViraChatBridge;
  readonly message: unknown;
  readonly pending?: ReactNode;
  readonly renderFailure?: (issue: { readonly code: string; readonly path: string; readonly message: string }) => ReactNode;
}

function defaultFailure(issue: { readonly message: string }): ReactNode {
  return <div role="alert">{issue.message}</div>;
}

function ResolvedExperienceView({
  experience,
  renderFailure,
}: {
  readonly experience: ViraResolvedExperience;
  readonly renderFailure: NonNullable<ViraChatExperienceProps["renderFailure"]>;
}) {
  useSyncExternalStore(experience.runtime.subscribe, experience.runtime.revision, experience.runtime.revision);
  const rendered = experience.runtime.renderReact({ renderers: experience.renderers });
  return rendered.ok
    ? <Fragment>{rendered.value}</Fragment>
    : <Fragment>{renderFailure(rendered.issue)}</Fragment>;
}

interface PresentationAttempt {
  readonly bridge: ViraChatBridge;
  readonly message: unknown;
  readonly promise: Promise<ViraChatBridgePresentResult>;
  consumers: number;
  instanceId?: string;
  disposed: boolean;
}

function releasePresentationAttempt(
  attempt: PresentationAttempt,
  attemptRef: { current: PresentationAttempt | undefined },
): void {
  queueMicrotask(() => {
    if (attempt.consumers !== 0 || attempt.disposed) return;

    const disposeResolved = (instanceId: string): void => {
      if (attempt.consumers !== 0 || attempt.disposed) return;
      attempt.bridge.dispose(instanceId);
      attempt.disposed = true;
      if (attemptRef.current === attempt) attemptRef.current = undefined;
    };

    if (attempt.instanceId !== undefined) {
      disposeResolved(attempt.instanceId);
      return;
    }

    void attempt.promise.then((result) => {
      if (result.ok) disposeResolved(result.value.instanceId);
    });
  });
}

export function ViraChatExperience({
  bridge,
  message,
  pending = null,
  renderFailure = defaultFailure,
}: ViraChatExperienceProps) {
  const [state, setState] = useState<
    | { readonly status: "pending" }
    | { readonly status: "ready"; readonly experience: ViraResolvedExperience }
    | { readonly status: "failed"; readonly issue: ViraChatBridgeIssue }
  >({ status: "pending" });
  const attemptRef = useRef<PresentationAttempt | undefined>(undefined);

  useEffect(() => {
    let attempt = attemptRef.current;
    if (
      attempt === undefined
      || attempt.disposed
      || attempt.bridge !== bridge
      || attempt.message !== message
    ) {
      attempt = {
        bridge,
        message,
        promise: bridge.present(message),
        consumers: 0,
        disposed: false,
      };
      attemptRef.current = attempt;
    }

    attempt.consumers += 1;
    let active = true;
    setState({ status: "pending" });

    void attempt.promise.then((result) => {
      if (result.ok) attempt.instanceId = result.value.instanceId;
      if (!active) return;
      if (result.ok) {
        setState({ status: "ready", experience: result.value });
      } else {
        setState({ status: "failed", issue: result.issue });
      }
    });

    return () => {
      active = false;
      attempt.consumers -= 1;
      releasePresentationAttempt(attempt, attemptRef);
    };
  }, [bridge, message]);

  if (state.status === "pending") return <Fragment>{pending}</Fragment>;
  if (state.status === "failed") return <Fragment>{renderFailure(state.issue)}</Fragment>;
  return <ResolvedExperienceView experience={state.experience} renderFailure={renderFailure} />;
}

export interface ViraChatCommandEffectProps {
  readonly bridge: ViraChatBridge;
  readonly message: unknown;
  readonly renderFailure?: (issue: ViraChatBridgeIssue) => ReactNode;
}

export function ViraChatCommandEffect({
  bridge,
  message,
  renderFailure = defaultFailure,
}: ViraChatCommandEffectProps) {
  const dispatched = useRef(false);
  const [failure, setFailure] = useState<ViraChatBridgeIssue | undefined>();

  useEffect(() => {
    if (dispatched.current) return undefined;
    dispatched.current = true;
    let active = true;
    void bridge.command(message).then((result) => {
      if (active && !result.ok) setFailure(result.issue);
    });
    return () => { active = false; };
  }, [bridge, message]);

  return failure ? <Fragment>{renderFailure(failure)}</Fragment> : null;
}
