import { registerOverlayPortal } from "@puckeditor/core";
import type { StudioWorkbenchSession } from "@vira-enterprise-genui/studio-workbench";
import { createElement, useLayoutEffect, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { resolveMockDomainPreviewProps } from "./mock-bindings.js";

const INTERACTIVE_SELECTOR = "button,input,select,textarea,a[href]";

type TrustedRenderContext = Readonly<{
  component: string;
  nodeId: string;
  props: Readonly<Record<string, unknown>>;
}>;

type TrustedRenderer = (context: TrustedRenderContext) => ReactNode;

function InteractiveAuthoringSurface({ children }: { readonly children: ReactNode }): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;

    const portals = new Map<HTMLElement, (() => void) | undefined>();
    const registerInteractiveElements = (): void => {
      for (const element of root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)) {
        if (portals.has(element)) continue;
        portals.set(element, registerOverlayPortal(element, { disableDrag: true }));
      }
    };

    const stopEditorBubble = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(INTERACTIVE_SELECTOR) === null) return;
      event.stopPropagation();
    };

    registerInteractiveElements();
    const observer = new MutationObserver(registerInteractiveElements);
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("click", stopEditorBubble);
    root.addEventListener("pointerdown", stopEditorBubble);

    return () => {
      observer.disconnect();
      root.removeEventListener("click", stopEditorBubble);
      root.removeEventListener("pointerdown", stopEditorBubble);
      for (const cleanup of [...portals.values()].reverse()) cleanup?.();
    };
  }, [children]);

  return createElement("div", { ref, style: { display: "contents" } }, children);
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
