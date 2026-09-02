import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const interopRoot = path.join(root, "interop/studio-experience/v1");
const schemaPath = path.join(interopRoot, "schema/studio-experience-document.schema.json");
const swiftPath = path.join(interopRoot, "swift/StudioExperienceModels.swift");
const kotlinPath = path.join(interopRoot, "kotlin/StudioExperienceModels.kt");
const digestPath = path.join(interopRoot, "SOURCE_DIGEST");
const typesPath = path.join(root, "packages/studio-schema/src/types.ts");
const syntaxPath = path.join(root, "packages/studio-schema/src/syntax.ts");
const semanticPath = path.join(root, "packages/protocol/src/semantic-id.ts");
const jsonValuePath = path.join(root, "packages/protocol/src/json-value.ts");

const read = (file) => fs.readFileSync(file, "utf8");

function literalStringConst(name, source) {
  const match = source.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")\\s+as\\s+const`));
  if (!match) throw new Error(`missing canonical string const ${name}`);
  return JSON.parse(match[1]);
}

function numericConst(name, source) {
  const match = source.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*([0-9_]+)\\s+as\\s+const`));
  if (!match) throw new Error(`missing canonical numeric const ${name}`);
  return Number(match[1].replaceAll("_", ""));
}

function regexSource(name, source) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*/((?:\\\\.|[^/])*)/[a-z]*;`));
  if (!match) throw new Error(`missing canonical regex ${name}`);
  return match[1];
}

function stripAnchors(pattern) {
  if (!pattern.startsWith("^") || !pattern.endsWith("$")) {
    throw new Error(`expected anchored canonical regex: ${pattern}`);
  }
  return pattern.slice(1, -1);
}

function escapeRegexLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const typesText = read(typesPath);
const syntaxText = read(syntaxPath);
const semanticText = read(semanticPath);
const jsonValueText = read(jsonValuePath);
const segmentPattern = regexSource("semanticSegmentPattern", semanticText);
const segmentBody = stripAnchors(segmentPattern);
const namespacePattern = `^${segmentBody}(?:\\.${segmentBody})*$`;
const componentPattern = `^${segmentBody}(?:\\.${segmentBody})+$`;
const payloadKeyPattern = regexSource("studioPayloadKeyPattern", syntaxText);
const scopeRoot = literalStringConst("STUDIO_SCOPE_ROOT", syntaxText);
const segmentMax = numericConst("SEMANTIC_SEGMENT_MAX_LENGTH", semanticText);
const namespaceMax = numericConst("SEMANTIC_NAMESPACE_MAX_LENGTH", semanticText);
const scopePrefix = `${scopeRoot}.`;
const scopePattern = `^${escapeRegexLiteral(scopePrefix)}${segmentBody}(?:\\.${segmentBody})*$`;
const scopeMax = scopePrefix.length + namespaceMax;

// The AST generator emits each CodingKey with an explicit `case` token for
// readability in its language-neutral template. Swift permits one `case`
// followed by a comma-separated identifier list. Normalize only that syntax;
// wire keys and semantic model content remain unchanged.
const swiftInput = read(swiftPath);
const swiftOutput = swiftInput.replace(
  /private enum CodingKeys: String, CodingKey \{ ([^\n}]+) \}/g,
  (_match, body) => `private enum CodingKeys: String, CodingKey { ${String(body).replace(/, case /g, ", ")} }`,
);
if (swiftOutput === swiftInput && swiftInput.includes(", case ")) {
  throw new Error("Swift CodingKeys normalization did not match generated output");
}
fs.writeFileSync(swiftPath, swiftOutput);

// Kotlin's Double.toLong() saturates outside Int64 range. Integral-looking
// canonical JSON numbers must remain Double-backed during serialization.
const kotlinInput = read(kotlinPath);
const lossyNumberWriter = "is ViraJson.Num->{ val number=value.value; if(number%1.0==0.0) number.toLong().toString() else number.toString() }";
const safeNumberWriter = "is ViraJson.Num->{ val number=value.value; if(!number.isFinite() || number.toRawBits() == (-0.0).toRawBits()) error(\"non-canonical number\"); number.toString() }";
if (!kotlinInput.includes(lossyNumberWriter)) {
  throw new Error("generated Kotlin number writer shape changed; update the finalizer intentionally");
}
const kotlinAfterWriter = kotlinInput.replace(lossyNumberWriter, safeNumberWriter);

// IEEE equality cannot distinguish +0.0 from -0.0. The generated parser used
// `number == -0.0`, which rejects ordinary JSON zero as well. Match the raw
// sign bit so only canonical-invalid negative zero is rejected.
const lossyNegativeZeroCheck = "number == -0.0";
const strictNegativeZeroCheck = "number.toRawBits() == (-0.0).toRawBits()";
const negativeZeroOccurrences = kotlinAfterWriter.split(lossyNegativeZeroCheck).length - 1;
if (negativeZeroOccurrences !== 1) {
  throw new Error(`expected one generated Kotlin negative-zero parser check, found ${negativeZeroOccurrences}`);
}
const kotlinOutput = kotlinAfterWriter.replace(lossyNegativeZeroCheck, strictNegativeZeroCheck);
fs.writeFileSync(kotlinPath, kotlinOutput);

// Structural schema constraints are finalized from canonical syntax sources,
// not from duplicated regex literals. Cross-field graph/uniqueness semantics
// remain the responsibility of parseStudioExperienceDocument(...).
const schema = JSON.parse(read(schemaPath));
const definitions = schema.$defs;
if (!definitions || typeof definitions !== "object") throw new Error("generated schema is missing $defs");

function objectDefinition(name) {
  const definition = definitions[name];
  if (!definition || definition.type !== "object" || !definition.properties) {
    throw new Error(`generated schema is missing object definition ${name}`);
  }
  return definition;
}

function stringConstraint(owner, property, pattern, maxLength) {
  const definition = objectDefinition(owner);
  if (!(property in definition.properties)) throw new Error(`generated schema is missing ${owner}.${property}`);
  definition.properties[property] = {
    type: "string",
    pattern,
    minLength: 1,
    maxLength,
  };
}

for (const [owner, property] of [
  ["StudioView", "id"],
  ["StudioNode", "id"],
  ["StudioNode", "parentId"],
  ["StudioNode", "slot"],
  ["StudioExperienceDocument", "entryView"],
  ["StudioBinding", "viewId"],
  ["StudioBinding", "nodeId"],
  ["StudioInteraction", "viewId"],
  ["StudioInteraction", "nodeId"],
  ["StudioInteractionRoute", "viewId"],
]) {
  stringConstraint(owner, property, segmentPattern, segmentMax);
}

for (const [owner, property] of [
  ["StudioExperienceDocument", "id"],
  ["StudioExperienceDocument", "recipeId"],
  ["StudioRepeatSource", "path"],
]) {
  stringConstraint(owner, property, namespacePattern, namespaceMax);
}
stringConstraint("StudioNode", "component", componentPattern, namespaceMax);
stringConstraint("StudioInteractionPayloadBinding", "key", payloadKeyPattern, segmentMax);

const bindingSource = objectDefinition("StudioBindingSource");
bindingSource.properties.path = { type: "string", minLength: 1, maxLength: scopeMax };
bindingSource.allOf = [
  {
    if: { properties: { kind: { const: "scope" } }, required: ["kind"] },
    then: {
      properties: {
        path: { type: "string", pattern: scopePattern, minLength: scopePrefix.length + 1, maxLength: scopeMax },
      },
    },
  },
  {
    if: { properties: { kind: { enum: ["state", "domain"] } }, required: ["kind"] },
    then: {
      properties: {
        path: { type: "string", pattern: namespacePattern, minLength: 1, maxLength: namespaceMax },
      },
    },
  },
];

fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

// The digest covers every canonical source consumed by generation/finalization.
// A syntax change therefore cannot be accepted with stale generated metadata.
const digest = crypto.createHash("sha256")
  .update(typesText)
  .update(semanticText)
  .update(jsonValueText)
  .update(syntaxText)
  .digest("hex");
fs.writeFileSync(digestPath, `${digest}\n`);
