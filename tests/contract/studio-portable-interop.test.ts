import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseStudioExperienceDocument } from "../../packages/studio-schema/src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../interop/studio-experience/v1");

function fixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(root, "fixtures", name), "utf8")) as unknown;
}

interface MutableFixture {
  [key: string]: unknown;
  views: Array<{ nodes: Array<Record<string, unknown>> }>;
  bindings: Array<Record<string, unknown>>;
  interactions: Array<{ routes: Array<Record<string, unknown>> }>;
}
interface InvalidCase { readonly name: string; readonly issueCode: string; readonly mutation: Record<string, unknown>; }

function mutate(base: unknown, spec: Record<string, unknown>): MutableFixture {
  const value = structuredClone(base) as MutableFixture;
  switch (spec.kind) {
    case "root-field": value[String(spec.field)] = spec.value; break;
    case "node-parent": {
      const node = value.views[Number(spec.view)]?.nodes[Number(spec.node)];
      if (!node) throw new Error("invalid node mutation fixture");
      node.parentId = spec.parentId;
      if (spec.slot !== undefined) node.slot = spec.slot;
      break;
    }
    case "append-root-node": {
      const view = value.views[Number(spec.view)];
      if (!view || spec.node === null || typeof spec.node !== "object" || Array.isArray(spec.node)) throw new Error("invalid append mutation fixture");
      view.nodes.push(structuredClone(spec.node) as Record<string, unknown>);
      break;
    }
    case "duplicate-binding": {
      const binding = value.bindings[Number(spec.index)];
      if (!binding) throw new Error("invalid binding mutation fixture");
      value.bindings.push(structuredClone(binding));
      break;
    }
    case "route-target": {
      const route = value.interactions[Number(spec.interaction)]?.routes[Number(spec.route)];
      if (!route) throw new Error("invalid route mutation fixture");
      route.viewId = spec.viewId;
      break;
    }
    default: throw new Error(`unknown fixture mutation: ${String(spec.kind)}`);
  }
  return value;
}

describe("MASTER-02 portable Studio Experience contract", () => {
  it("round-trips the shared domain-neutral fixture through the canonical semantic parser", () => {
    const input = fixture("valid.json");
    const result = parseStudioExperienceDocument(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(JSON.stringify(result.value))).toEqual(input);
  });

  it("keeps semantic-negative fixtures pinned to exact canonical issue codes", () => {
    const base = fixture("valid.json");
    const cases = fixture("semantic-invalid-cases.json") as InvalidCase[];
    for (const item of cases) {
      const result = parseStudioExperienceDocument(mutate(base, item.mutation));
      expect(result, item.name).toMatchObject({ ok: false, issue: { code: item.issueCode } });
    }
  });

  it("pins generated structural artifacts to v1 without executable or customer-domain escape hatches", () => {
    const schema = JSON.parse(fs.readFileSync(path.join(root, "schema/studio-experience-document.schema.json"), "utf8")) as {
      $schema: string;
      $defs: { StudioExperienceDocument: { additionalProperties: boolean; properties: { version: unknown } } };
    };
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$defs.StudioExperienceDocument.properties.version).toEqual({ const: "1" });
    expect(schema.$defs.StudioExperienceDocument.additionalProperties).toBe(false);
    const generated = [
      "schema/studio-experience-document.schema.json",
      "swift/StudioExperienceModels.swift",
      "kotlin/StudioExperienceModels.kt",
    ].map((name) => fs.readFileSync(path.join(root, name), "utf8")).join("\n");
    expect(generated).not.toMatch(/pegasus|airline|flightCard|endpoint|apiKey|secret|iframe|javascript/i);
  });
});
