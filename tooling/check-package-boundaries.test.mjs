import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateWorkspace } from "./check-package-boundaries.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(definitions) {
  const root = await mkdtemp(path.join(os.tmpdir(), "vira-genui-boundaries-"));
  temporaryRoots.push(root);
  for (const [folder, definition] of Object.entries(definitions)) {
    const packageRoot = path.join(root, "packages", folder);
    await mkdir(path.join(packageRoot, "src"), { recursive: true });
    await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({
      name: definition.name ?? `@vira-enterprise-genui/${folder}`,
      version: "0.0.0",
      private: true,
      type: "module",
      dependencies: definition.dependencies ?? {},
    }));
    await writeFile(path.join(packageRoot, "src", "index.ts"), definition.source ?? "export {};\n");
  }
  return root;
}

describe("package boundary enforcement", () => {
  it("accepts an allowed and declared internal dependency", async () => {
    const root = await workspace({
      protocol: {},
      "runtime-core": {
        dependencies: { "@vira-enterprise-genui/protocol": "workspace:*" },
        source: "import type {} from '@vira-enterprise-genui/protocol';\nexport {};\n",
      },
    });
    const result = await validateWorkspace(root);
    expect(result.ok).toBe(true);
  });

  it("rejects a forbidden dependency direction", async () => {
    const root = await workspace({
      protocol: {
        dependencies: { "@vira-enterprise-genui/runtime-core": "workspace:*" },
        source: "import type {} from '@vira-enterprise-genui/runtime-core';\nexport {};\n",
      },
      "runtime-core": {},
    });
    const result = await validateWorkspace(root);
    expect(result.errors.some((error) => error.code === "FORBIDDEN_DEPENDENCY")).toBe(true);
  });

  it("rejects an undeclared internal source import", async () => {
    const root = await workspace({
      protocol: {},
      planner: {
        source: "import type {} from '@vira-enterprise-genui/protocol';\nexport {};\n",
      },
    });
    const result = await validateWorkspace(root);
    expect(result.errors.some((error) => error.code === "UNDECLARED_INTERNAL_IMPORT")).toBe(true);
  });

  it("rejects relative imports that reach into another package", async () => {
    const root = await workspace({
      protocol: {},
      "runtime-core": {
        source: "import '../../protocol/src/index.ts';\nexport {};\n",
      },
    });
    const result = await validateWorkspace(root);
    expect(result.errors.some((error) => error.code === "CROSS_PACKAGE_RELATIVE_IMPORT")).toBe(true);
  });

  it("detects circular package dependencies", async () => {
    const root = await workspace({
      protocol: {
        dependencies: { "@vira-enterprise-genui/runtime-core": "workspace:*" },
      },
      "runtime-core": {
        dependencies: { "@vira-enterprise-genui/protocol": "workspace:*" },
      },
    });
    const result = await validateWorkspace(root);
    expect(result.errors.some((error) => error.code === "CIRCULAR_DEPENDENCY")).toBe(true);
  });

  it("rejects duplicate internal package names", async () => {
    const root = await workspace({
      protocol: {},
      telemetry: { name: "@vira-enterprise-genui/protocol" },
    });
    const result = await validateWorkspace(root);
    expect(result.errors.some((error) => error.code === "DUPLICATE_PACKAGE_NAME")).toBe(true);
  });
});
