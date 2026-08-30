import { registerOverlayPortal } from "@puckeditor/core";
import type { StudioWorkbenchSession } from "@vira-enterprise-genui/studio-workbench";
import { createElement, useLayoutEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, ReactElement, ReactNode } from "react";
import { resolveMockDomainPreviewProps } from "./mock-bindings.js";

const SEAT_SELECTOR = "button.vira-seat";

type TrustedRenderContext = Readonly<{
  component: string;
  nodeId: string;
  props: Readonly<Record<string, unknown>>;
}>;

type TrustedRenderer = (context: TrustedRenderContext) => ReactNode;

function seatId(button: HTMLButtonElement): string | undefined {
  const value = button.querySelector("strong")?.textContent?.trim();
  return value && value.length > 0 ? value : undefined;
}

function applyAuthoringSeatState(
  root: HTMLElement,
  selectedSeats: ReadonlySet<string>,
  baseAssigned: { current: number | undefined },
): void {
  const progress = root.querySelector<HTMLElement>(".vira-active-traveller div > span");
  if (!progress) return;

  const match = progress.textContent?.match(/^(\d+)\/(\d+) assigned$/);
  if (!match) return;
  const currentAssigned = Number.parseInt(match[1] ?? "0", 10);
  const passengers = Number.parseInt(match[2] ?? "0", 10);
  if (!Number.isSafeInteger(passengers) || passengers < 1) return;

  if (baseAssigned.current === undefined) {
    baseAssigned.current = Math.min(passengers, Math.max(0, currentAssigned));
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>(SEAT_SELECTOR)) {
    const id = seatId(button);
    if (id && selectedSeats.has(id)) {
      button.classList.add("selected");
      button.disabled = true;
    }
  }

  const assigned = Math.min(passengers, baseAssigned.current + selectedSeats.size);
  progress.textContent = `${assigned}/${passengers} assigned`;

  const banner = root.querySelector<HTMLElement>(".vira-active-traveller");
  const avatar = banner?.querySelector<HTMLElement>(":scope > span");
  const title = banner?.querySelector<HTMLElement>("div > strong");
  if (title) {
    title.textContent = assigned >= passengers
      ? "All travellers have seats"
      : `Choose a seat for traveller ${assigned + 1}`;
  }
  if (avatar) avatar.textContent = `P${Math.min(passengers, assigned + 1)}`;

  if (assigned >= passengers) {
    for (const button of root.querySelectorAll<HTMLButtonElement>(SEAT_SELECTOR)) {
      if (!button.classList.contains("occupied")) button.disabled = true;
    }
  }
}

function InteractiveAuthoringSurface({ children }: { readonly children: ReactNode }): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const selectedSeats = useRef(new Set<string>());
  const baseAssigned = useRef<number | undefined>(undefined);
  const timers = useRef(new Set<number>());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;

    // One portal for the trusted brand-renderer surface is enough. Registering
    // every imperative child as its own portal caused Puck's pointer lifecycle
    // to stall while Playwright was completing a click.
    const disposePortal = registerOverlayPortal(root, { disableDragOnFocus: true });
    applyAuthoringSeatState(root, selectedSeats.current, baseAssigned);

    return () => {
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current.clear();
      disposePortal?.();
    };
  }, []);

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>(SEAT_SELECTOR);
    if (!button || !ref.current?.contains(button)) return;
    if (button.disabled || button.classList.contains("occupied") || button.classList.contains("selected")) return;

    const id = seatId(button);
    if (!id) return;
    selectedSeats.current.add(id);

    // Let the native/Puck click finish before mutating the imperative preview
    // DOM. This keeps Playwright's click lifecycle deterministic.
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      const root = ref.current;
      if (root) applyAuthoringSeatState(root, selectedSeats.current, baseAssigned);
    }, 0);
    timers.current.add(timer);
  };

  return createElement("div", {
    ref,
    onClickCapture,
    style: { display: "contents" },
  }, children);
}

export function createMockAuthoringRenderers(
  session: Pick<StudioWorkbenchSession, "currentDocument" | "currentViewId">,
  renderers: Readonly<Record<string, unknown>>,
): Readonly<Record<string, TrustedRenderer>> {
  const output: Record<string, TrustedRenderer> = Object.create(null) as Record<string, TrustedRenderer>;

  for (const [component, candidate] of Object.entries(renderers)) {
    if (typeof candidate !== "function") throw new Error(`Studio renderer ${component} must be a function`);
    const renderer = candidate as TrustedRenderer;
    output[component] = (context) => {
      const props = resolveMockDomainPreviewProps(
        session.currentDocument(),
        session.currentViewId(),
        context.nodeId,
        context.props,
      );
      return createElement(
        InteractiveAuthoringSurface,
        null,
        renderer({ ...context, props }),
      );
    };
  }

  return Object.freeze(output);
}
