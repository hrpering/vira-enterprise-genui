import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["packages", "sdk", "examples"] as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".kt", ".java", ".swift", ".json", ".html", ".css"]);
const FORBIDDEN = /\b(?:pegasus|airline|flight)\b/i;

async function sourceFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "build" || entry.name === "dist") continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) output.push(child);
    }
  }
  await visit(root);
  return output;
}

describe("MASTER-23 Pegasus extraction boundary", () => {
  it("keeps Pegasus, airline and flight semantics out of Vira production/workspace surfaces", async () => {
    const violations: string[] = [];
    for (const root of ROOTS) {
      for (const file of await sourceFiles(root)) {
        const content = await readFile(file, "utf8");
        if (FORBIDDEN.test(content)) violations.push(relative(process.cwd(), file));
      }
    }
    const rootPackage = await readFile("package.json", "utf8");
    if (FORBIDDEN.test(rootPackage)) violations.push("package.json");
    expect(violations, "brand/domain semantics must live in the external proof repository").toEqual([]);
  });
});
