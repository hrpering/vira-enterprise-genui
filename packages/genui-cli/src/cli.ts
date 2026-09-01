#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  defineStudioExperience,
  prepareAuthoredStudioPreview,
  prepareAuthoredStudioPublication,
} from "@vira-enterprise-genui/studio-authoring";
import type { StudioAuthoringDocumentInput } from "@vira-enterprise-genui/studio-authoring";

type Command = "validate" | "build" | "preview";
type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as UnknownRecord
    : undefined;
}

async function loadInput(fileName: string): Promise<unknown> {
  const absolute = resolve(process.cwd(), fileName);
  if (absolute.endsWith(".json")) {
    return JSON.parse(await readFile(absolute, "utf8")) as unknown;
  }
  const moduleValue: unknown = await import(pathToFileURL(absolute).href);
  const moduleRecord = record(moduleValue);
  return moduleRecord && Object.hasOwn(moduleRecord, "default")
    ? moduleRecord.default
    : moduleValue;
}

function documentFrom(input: unknown): StudioAuthoringDocumentInput | undefined {
  const root = record(input);
  if (!root) return undefined;
  const candidate = Object.hasOwn(root, "document") ? root.document : input;
  return record(candidate) ? candidate as unknown as StudioAuthoringDocumentInput : undefined;
}

function publicationInputFrom(input: unknown): {
  readonly document: StudioAuthoringDocumentInput;
  readonly componentCatalog: unknown;
  readonly bindingSourceCatalog: unknown;
  readonly actionAdapter: unknown;
} | undefined {
  const root = record(input);
  const document = documentFrom(input);
  if (!root || !document) return undefined;
  if (!Object.hasOwn(root, "componentCatalog") || !Object.hasOwn(root, "bindingSourceCatalog") || !Object.hasOwn(root, "actionAdapter")) return undefined;
  return {
    document,
    componentCatalog: root.componentCatalog,
    bindingSourceCatalog: root.bindingSourceCatalog,
    actionAdapter: root.actionAdapter,
  };
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message: string, detail?: unknown): never {
  process.stderr.write(`${message}\n`);
  if (detail !== undefined) process.stderr.write(`${JSON.stringify(detail, null, 2)}\n`);
  process.exitCode = 1;
  throw new Error("VIRA_GENUI_CLI_EXIT");
}

export async function runGenUICommand(command: Command, fileName: string, viewId?: string): Promise<void> {
  const input = await loadInput(fileName);

  if (command === "validate") {
    const document = documentFrom(input);
    if (!document) fail("GenUI validate expects a Studio document or { document } config.");
    const result = defineStudioExperience(document);
    if (!result.ok) fail("GenUI document validation failed.", result.issue);
    print(result.value);
    return;
  }

  const publicationInput = publicationInputFrom(input);
  if (!publicationInput) {
    fail("GenUI build/preview expects { document, componentCatalog, bindingSourceCatalog, actionAdapter }.");
  }

  if (command === "build") {
    const result = prepareAuthoredStudioPublication(publicationInput);
    if (!result.ok) fail(`GenUI build failed at ${result.stage}.`, result.issue);
    print(result.value);
    return;
  }

  const targetView = viewId ?? publicationInput.document.entryView;
  const result = prepareAuthoredStudioPreview({ ...publicationInput, viewId: targetView });
  if (!result.ok) fail(`GenUI preview failed at ${result.stage}.`, result.issue);
  print(result.value);
}

function usage(): never {
  process.stderr.write("Usage: vira-genui <validate|build|preview> <experience.ts|experience.js|experience.json> [--view <view-id>]\n");
  process.exitCode = 1;
  throw new Error("VIRA_GENUI_CLI_EXIT");
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const fileName = process.argv[3];
  if ((command !== "validate" && command !== "build" && command !== "preview") || !fileName) usage();

  const viewFlag = process.argv.indexOf("--view", 4);
  const viewId = viewFlag >= 0 ? process.argv[viewFlag + 1] : undefined;
  if (viewFlag >= 0 && !viewId) usage();
  await runGenUICommand(command, fileName, viewId);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    if (error instanceof Error && error.message === "VIRA_GENUI_CLI_EXIT") return;
    process.stderr.write("GenUI CLI failed safely.\n");
    process.exitCode = 1;
  });
}
