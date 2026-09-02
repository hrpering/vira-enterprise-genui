import fs from "node:fs";
import path from "node:path";

const swiftPath = path.join(process.cwd(), "interop/studio-experience/v1/swift/StudioExperienceModels.swift");
const input = fs.readFileSync(swiftPath, "utf8");

// The AST generator emits each CodingKey with an explicit `case` token for
// readability in its language-neutral template. Swift permits one `case`
// followed by a comma-separated identifier list. Normalize only that syntax;
// wire keys and semantic model content remain unchanged.
const output = input.replace(
  /private enum CodingKeys: String, CodingKey \{ ([^\n}]+) \}/g,
  (_match, body) => `private enum CodingKeys: String, CodingKey { ${String(body).replace(/, case /g, ", ")} }`,
);

if (output === input && input.includes(", case ")) {
  throw new Error("Swift CodingKeys normalization did not match generated output");
}

fs.writeFileSync(swiftPath, output);
