import { createElement } from "react";
import type { ChangeEvent, ReactNode } from "react";

const colorPattern = /^#[0-9A-Fa-f]{6}$/;

type ColorFieldParams = {
  readonly value?: unknown;
  readonly onChange?: unknown;
};

function paramsOf(input: unknown): ColorFieldParams {
  return input !== null && typeof input === "object" ? input as ColorFieldParams : {};
}

export function createStudioColorPuckField(label: string): Record<string, unknown> {
  return {
    type: "custom",
    label,
    render: (input: unknown): ReactNode => {
      const params = paramsOf(input);
      if (typeof params.onChange !== "function") return null;
      const onChange = params.onChange as (value: unknown) => void;
      const value = typeof params.value === "string" && colorPattern.test(params.value)
        ? params.value.toUpperCase()
        : "#000000";
      return createElement(
        "label",
        { style: { display: "grid", gap: 6 } },
        createElement("span", { style: { fontSize: 12, fontWeight: 600 } }, label),
        createElement(
          "div",
          { style: { display: "grid", gridTemplateColumns: "44px minmax(0, 1fr)", gap: 8, alignItems: "center" } },
          createElement("input", {
            type: "color",
            value,
            "aria-label": label,
            onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.value.toUpperCase()),
            style: { width: 44, height: 34, padding: 0, border: 0, background: "transparent" },
          }),
          createElement("code", { style: { fontSize: 12 } }, value),
        ),
      );
    },
  };
}
