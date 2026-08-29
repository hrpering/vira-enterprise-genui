import type { StudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import type { StudioPuckAdapterValidationIssue } from "./types.js";

const reservedPuckFields = new Set(["id", "puck"]);

export function findPuckCatalogCompatibilityIssue(
  catalog: StudioComponentCatalog,
): StudioPuckAdapterValidationIssue | undefined {
  for (let componentIndex = 0; componentIndex < catalog.components.length; componentIndex += 1) {
    const component = catalog.components[componentIndex];
    if (!component) continue;
    const propKeys = new Set(component.props.map((prop) => prop.key));
    for (const prop of component.props) {
      if (reservedPuckFields.has(prop.key)) {
        return {
          code: "PUCK_FIELD_COLLISION",
          path: `$.catalog.components[${componentIndex}].props`,
          message: "catalog prop collides with a Puck-reserved field",
        };
      }
    }
    for (const slot of component.slots) {
      if (reservedPuckFields.has(slot.name) || propKeys.has(slot.name)) {
        return {
          code: "PUCK_FIELD_COLLISION",
          path: `$.catalog.components[${componentIndex}].slots`,
          message: "catalog slot collides with a Puck-reserved field or component prop",
        };
      }
    }
  }
  return undefined;
}
