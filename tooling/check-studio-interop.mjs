import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const artifacts = [
  "interop/studio-experience/v1/schema/studio-experience-document.schema.json",
  "interop/studio-experience/v1/swift/StudioExperienceModels.swift",
  "interop/studio-experience/v1/kotlin/StudioExperienceModels.kt",
  "interop/studio-experience/v1/SOURCE_DIGEST",
].map((relative) => path.join(root, relative));

const committed = new Map(artifacts.map((file) => [file, fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined]));
let drift = false;

try {
  const result = spawnSync(process.execPath, ["tooling/generate-studio-interop.mjs"], { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`generator failed (${result.status})\n${result.stdout}\n${result.stderr}`);

  const finalize = spawnSync(process.execPath, ["tooling/finalize-studio-interop.mjs"], { cwd: root, encoding: "utf8" });
  if (finalize.error) throw finalize.error;
  if (finalize.status !== 0) throw new Error(`finalizer failed (${finalize.status})\n${finalize.stdout}\n${finalize.stderr}`);

  for (const file of artifacts) {
    const expected = committed.get(file);
    const actual = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
    if (expected !== actual) {
      console.error(`generated artifact drift: ${path.relative(root, file)}`);
      drift = true;
    }
  }
} finally {
  for (const [file, content] of committed) {
    if (content === undefined) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, content);
  }
}

if (drift) process.exit(1);
