import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["tests", "packages"] as const;
const TEST_FILE = /(?:^|\/)[^/]+\.test\.(?:ts|tsx|js|mjs)$/;
const NODE_TEST_IMPORT = /(?:from\s+["']node:test["']|require\(\s*["']node:test["']\s*\))/;

async function testFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && TEST_FILE.test(child)) output.push(child);
    }
  }
  await visit(root);
  return output;
}

describe("test runner registration", () => {
  it("keeps repository test files registered with the authoritative Vitest gate", async () => {
    const violations: string[] = [];
    for (const root of ROOTS) {
      for (const file of await testFiles(root)) {
        const content = await readFile(file, "utf8");
        if (NODE_TEST_IMPORT.test(content)) violations.push(relative(process.cwd(), file));
      }
    }
    expect(violations, "node:test files execute outside Vitest accounting and can hide failures").toEqual([]);
  });
});
