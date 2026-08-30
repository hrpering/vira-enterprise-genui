import { createAirlineStarterDocument } from "@vira-enterprise-genui/airline-brand-kit/studio";
import { describe, expect, it } from "vitest";
import {
  applyMockDomainBindings,
  resolveMockDomainPreviewProps,
} from "./mock-bindings.js";

describe("Studio mock domain authoring bindings", () => {
  it("hydrates bound seat props from the shared mock airline domain", () => {
    const bound = applyMockDomainBindings(
      createAirlineStarterDocument("demo.bound-seat", "seat-selection"),
    );
    const node = bound.views[0]?.nodes[0];
    expect(node?.props).not.toHaveProperty("passengers");
    expect(node?.props).not.toHaveProperty("fare");

    const resolved = resolveMockDomainPreviewProps(
      bound,
      "main",
      "root",
      { passengers: 1, fare: "light" },
    );

    expect(resolved.passengers).toBe(2);
    expect(resolved.fare).toBe("smart");
  });

  it("does not overwrite props that are not bound", () => {
    const document = createAirlineStarterDocument("demo.unbound-seat", "seat-selection");
    const resolved = resolveMockDomainPreviewProps(
      document,
      "main",
      "root",
      { passengers: 4, fare: "flex" },
    );

    expect(resolved.passengers).toBe(4);
    expect(resolved.fare).toBe("flex");
  });
});
