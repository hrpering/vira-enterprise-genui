import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STUDIO_SCOPE_ROOT } from "../../packages/studio-schema/src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../interop/studio-experience/v1");

interface StringSchema {
  readonly type?: string;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
}

interface ObjectSchema {
  readonly properties: Record<string, StringSchema>;
  readonly allOf?: ReadonlyArray<{
    readonly if?: { readonly properties?: { readonly kind?: { readonly const?: string; readonly enum?: readonly string[] } } };
    readonly then?: { readonly properties?: { readonly path?: StringSchema } };
  }>;
}

function loadDefinitions(): Record<string, ObjectSchema> {
  const schema = JSON.parse(
    fs.readFileSync(path.join(root, "schema/studio-experience-document.schema.json"), "utf8"),
  ) as { readonly $defs: Record<string, ObjectSchema> };
  return schema.$defs;
}

describe("MASTER-02 generated syntax constraints", () => {
  it("uses one semantic-segment pattern for identifiers and cross references", () => {
    const definitions = loadDefinitions();
    const segmentPattern = definitions.StudioNode?.properties.id?.pattern;
    expect(segmentPattern).toBeTruthy();

    for (const [owner, property] of [
      ["StudioView", "id"],
      ["StudioNode", "parentId"],
      ["StudioNode", "slot"],
      ["StudioExperienceDocument", "entryView"],
      ["StudioBinding", "viewId"],
      ["StudioBinding", "nodeId"],
      ["StudioInteraction", "viewId"],
      ["StudioInteraction", "nodeId"],
      ["StudioInteractionRoute", "viewId"],
    ] as const) {
      expect(definitions[owner]?.properties[property]?.pattern, `${owner}.${property}`).toBe(segmentPattern);
    }
  });

  it("keeps repeat and binding source paths structurally bounded by canonical path families", () => {
    const definitions = loadDefinitions();
    const namespacePattern = definitions.StudioExperienceDocument?.properties.id?.pattern;
    expect(namespacePattern).toBeTruthy();
    expect(definitions.StudioRepeatSource?.properties.path?.pattern).toBe(namespacePattern);

    const bindingSource = definitions.StudioBindingSource;
    expect(bindingSource?.properties.path?.type).toBe("string");
    const scopeRule = bindingSource?.allOf?.find((rule) => rule.if?.properties?.kind?.const === "scope");
    const ordinaryRule = bindingSource?.allOf?.find((rule) => rule.if?.properties?.kind?.enum?.includes("state"));
    expect(scopeRule?.then?.properties?.path?.pattern).toContain(STUDIO_SCOPE_ROOT);
    expect(ordinaryRule?.then?.properties?.path?.pattern).toBe(namespacePattern);
    expect(scopeRule?.then?.properties?.path?.maxLength).toBeGreaterThan(
      ordinaryRule?.then?.properties?.path?.maxLength ?? Number.MAX_SAFE_INTEGER,
    );
  });
});
