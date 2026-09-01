import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runGenUICommand } from "../../packages/genui-cli/src/cli.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function document() {
  return {
    id: "cli.example",
    recipeId: "cli.example",
    entryView: "main",
    views: [{
      id: "main",
      nodes: [{ id: "submit", component: "cli.component.button", order: 0, props: {} }],
    }],
    interactions: [{
      viewId: "main",
      nodeId: "submit",
      event: "press",
      actionEvent: "cli.submit",
      routes: [{ outcome: "success", viewId: "main" }],
    }],
  };
}

function config() {
  return {
    document: document(),
    componentCatalog: {
      version: "1",
      id: "cli.components",
      brandId: "cli",
      components: [{
        ref: "cli.component.button",
        label: "Button",
        category: "action",
        kind: "action",
        props: [],
        slots: [],
        events: [{ name: "press", label: "Press" }],
      }],
    },
    bindingSourceCatalog: { version: "1", id: "cli.data", sources: [] },
    actionAdapter: {
      version: "1",
      id: "cli.actions",
      mappings: [{ event: "cli.submit", actionType: "cli.submit" }],
    },
  };
}

async function fixture(value: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "vira-genui-cli-"));
  temporaryDirectories.push(directory);
  const fileName = join(directory, "experience.json");
  await writeFile(fileName, JSON.stringify(value), "utf8");
  return fileName;
}

describe("GenUI manual authoring CLI", () => {
  it("validates a raw canonical authoring document through studio-schema", async () => {
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runGenUICommand("validate", await fixture(document()));
    expect(output).toHaveBeenCalled();
    expect(String(output.mock.calls[0]?.[0])).toContain('"id": "cli.example"');
  });

  it("builds and previews through the existing Studio publication gates", async () => {
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const fileName = await fixture(config());

    await runGenUICommand("build", fileName);
    expect(String(output.mock.calls.at(-1)?.[0])).toContain('"id": "cli.example"');

    await runGenUICommand("preview", fileName, "main");
    expect(String(output.mock.calls.at(-1)?.[0])).toContain('"viewId": "main"');
  });
});
