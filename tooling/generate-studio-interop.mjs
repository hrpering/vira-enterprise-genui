import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = process.cwd();
const typesPath = path.join(root, "packages/studio-schema/src/types.ts");
const semanticPath = path.join(root, "packages/protocol/src/semantic-id.ts");
const jsonValuePath = path.join(root, "packages/protocol/src/json-value.ts");
const outRoot = path.join(root, "interop/studio-experience/v1");
const check = process.argv.includes("--check");

const read = (file) => fs.readFileSync(file, "utf8");
const sourceText = read(typesPath);
const semanticText = read(semanticPath);
const jsonValueText = read(jsonValuePath);
const source = ts.createSourceFile(typesPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function literalConst(name, text = sourceText) {
  const match = text.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*([^;]+?)\\s+as\\s+const`));
  if (!match) throw new Error(`missing canonical const ${name}`);
  const raw = match[1].replaceAll("_", "").trim();
  if (/^".*"$/.test(raw)) return JSON.parse(raw);
  if (/^\d+$/.test(raw)) return Number(raw);
  throw new Error(`unsupported canonical const ${name}: ${match[1]}`);
}

const C = Object.fromEntries([
  "STUDIO_DOCUMENT_VERSION",
  "STUDIO_MAX_VIEWS",
  "STUDIO_MAX_NODES_PER_VIEW",
  "STUDIO_MAX_BINDINGS",
  "STUDIO_MAX_INTERACTIONS",
  "STUDIO_MAX_ACTION_PAYLOAD_BINDINGS",
  "STUDIO_EVENT_MAX_LENGTH",
].map((name) => [name, literalConst(name)]));
const P = Object.fromEntries([
  "SEMANTIC_SEGMENT_MAX_LENGTH",
  "SEMANTIC_NAMESPACE_MAX_LENGTH",
].map((name) => [name, literalConst(name, semanticText)]));
const J = Object.fromEntries([
  "JSON_VALUE_MAX_DEPTH",
  "JSON_VALUE_MAX_NODES",
  "JSON_VALUE_MAX_ARRAY_LENGTH",
  "JSON_VALUE_MAX_OBJECT_KEYS",
  "JSON_VALUE_MAX_OBJECT_KEY_LENGTH",
  "JSON_VALUE_MAX_STRING_LENGTH",
  "JSON_VALUE_MAX_TOTAL_STRING_LENGTH",
].map((name) => [name, literalConst(name, jsonValueText)]));

const segmentPattern = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$";
const namespacePattern = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$";
const componentPattern = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$";

const rawInterfaces = new Map();
const rawAliases = new Map();
for (const statement of source.statements) {
  if (ts.isInterfaceDeclaration(statement) && statement.name.text.startsWith("Studio")) {
    rawInterfaces.set(statement.name.text, statement);
  }
  if (ts.isTypeAliasDeclaration(statement) && statement.name.text.startsWith("Studio")) {
    rawAliases.set(statement.name.text, statement);
  }
}
if (!rawInterfaces.has("StudioExperienceDocument")) throw new Error("canonical StudioExperienceDocument not found");

const models = new Map();

function upperFirst(value) {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function syntheticName(owner, property) {
  return `${owner}${upperFirst(property)}`;
}

function literalStringUnion(ir) {
  if (ir.k === "literal" && typeof ir.value === "string") return [ir.value];
  if (ir.k !== "union") return undefined;
  const values = [];
  for (const option of ir.options) {
    if (option.k !== "literal" || typeof option.value !== "string") return undefined;
    values.push(option.value);
  }
  return values;
}

function membersIR(members, owner) {
  return members.map((member) => {
    if (!ts.isPropertySignature(member) || !member.type || !member.name) {
      throw new Error(`unsupported member in ${owner}`);
    }
    const name = member.name.getText(source).replace(/^["']|["']$/g, "");
    let type = typeIR(member.type, owner, name);
    const literals = literalStringUnion(type);
    if (literals && literals.length > 1) {
      const enumName = syntheticName(owner, name);
      if (!models.has(enumName)) {
        models.set(enumName, {
          kind: "alias",
          type: { k: "union", options: literals.map((value) => ({ k: "literal", value })) },
        });
      }
      type = { k: "named", name: enumName };
    }
    return { name, optional: Boolean(member.questionToken), type };
  });
}

function typeIR(node, owner = "Anonymous", property = "value") {
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText(source);
    if (name === "JsonValue") return { k: "json" };
    if (name === "JsonObject") return { k: "jsonObject" };
    return { k: "named", name };
  }
  if (node.kind === ts.SyntaxKind.StringKeyword) return { k: "string" };
  if (node.kind === ts.SyntaxKind.NumberKeyword) return { k: "number" };
  if (node.kind === ts.SyntaxKind.BooleanKeyword) return { k: "boolean" };
  if (ts.isLiteralTypeNode(node)) {
    if (ts.isStringLiteral(node.literal)) return { k: "literal", value: node.literal.text };
    if (node.literal.kind === ts.SyntaxKind.NullKeyword) return { k: "null" };
    throw new Error(`unsupported literal ${node.getText(source)}`);
  }
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword && ts.isArrayTypeNode(node.type)) {
    return { k: "array", item: typeIR(node.type.elementType, owner, property) };
  }
  if (ts.isArrayTypeNode(node)) return { k: "array", item: typeIR(node.elementType, owner, property) };
  if (ts.isTypeQueryNode(node)) {
    const name = node.exprName.getText(source);
    if (!(name in C)) throw new Error(`unsupported typeof ${name}`);
    return { k: "literal", value: C[name] };
  }
  if (ts.isUnionTypeNode(node)) {
    return { k: "union", options: node.types.map((type, index) => typeIR(type, owner, `${property}${index}`)) };
  }
  if (ts.isTypeLiteralNode(node)) {
    const name = syntheticName(owner, property);
    if (!models.has(name)) {
      models.set(name, { kind: "object", props: [] });
      models.set(name, { kind: "object", props: membersIR(node.members, name) });
    }
    return { k: "named", name };
  }
  throw new Error(`unsupported type ${node.getText(source)}`);
}

function ensureModel(name) {
  const existing = models.get(name);
  if (existing) return existing;
  const interfaceNode = rawInterfaces.get(name);
  if (interfaceNode) {
    models.set(name, { kind: "object", props: [] });
    const model = { kind: "object", props: membersIR(interfaceNode.members, name) };
    models.set(name, model);
    return model;
  }
  const aliasNode = rawAliases.get(name);
  if (aliasNode) {
    models.set(name, { kind: "alias", type: { k: "string" } });
    const model = { kind: "alias", type: typeIR(aliasNode.type, name, "value") };
    models.set(name, model);
    return model;
  }
  throw new Error(`referenced Studio model ${name} has no canonical declaration`);
}

const reachable = new Set();
function visitIR(ir) {
  if (ir.k === "named") {
    visitModel(ir.name);
    return;
  }
  if (ir.k === "array") {
    visitIR(ir.item);
    return;
  }
  if (ir.k === "union") {
    for (const option of ir.options) visitIR(option);
  }
}
function visitModel(name) {
  if (reachable.has(name)) return;
  reachable.add(name);
  const model = ensureModel(name);
  if (model.kind === "object") {
    for (const property of model.props) visitIR(property.type);
  } else {
    visitIR(model.type);
  }
}
visitModel("StudioExperienceDocument");

const outputModels = new Map(
  [...reachable].sort((a, b) => a.localeCompare(b)).map((name) => [name, ensureModel(name)]),
);

function expectModel(name, expectedProperties) {
  const model = outputModels.get(name);
  if (!model || model.kind !== "object") throw new Error(`missing reachable model ${name}`);
  const actual = model.props.map((property) => property.name).join(",");
  if (actual !== expectedProperties.join(",")) {
    throw new Error(`canonical ${name} fields changed: ${actual}`);
  }
}
expectModel("StudioExperienceDocument", ["version", "id", "recipeId", "entryView", "views", "bindings", "interactions"]);

const maxItems = new Map([
  ["StudioExperienceDocument.views", C.STUDIO_MAX_VIEWS],
  ["StudioExperienceDocument.bindings", C.STUDIO_MAX_BINDINGS],
  ["StudioExperienceDocument.interactions", C.STUDIO_MAX_INTERACTIONS],
  ["StudioView.nodes", C.STUDIO_MAX_NODES_PER_VIEW],
  ["StudioInteraction.payloadBindings", C.STUDIO_MAX_ACTION_PAYLOAD_BINDINGS],
]);
const nonEmptyArrays = new Set(["StudioExperienceDocument.views", "StudioView.nodes"]);
const semanticSegmentProperties = new Set([
  "StudioView.id",
  "StudioNode.id",
  "StudioNode.parentId",
  "StudioNode.slot",
  "StudioExperienceDocument.entryView",
]);
const semanticNamespaceProperties = new Set([
  "StudioExperienceDocument.id",
  "StudioExperienceDocument.recipeId",
]);
const safePropProperties = new Set(["StudioBinding.prop"]);
const eventProperties = new Set(["StudioInteraction.event", "StudioInteraction.actionEvent"]);
const payloadKeyProperties = new Set(["StudioInteractionPayloadBinding.key"]);

function schemaFor(ir, context = "") {
  if (ir.k === "string") return { type: "string" };
  if (ir.k === "number") return { type: "number" };
  if (ir.k === "boolean") return { type: "boolean" };
  if (ir.k === "null") return { type: "null" };
  if (ir.k === "literal") return { const: ir.value };
  if (ir.k === "named") return { $ref: `#/$defs/${ir.name}` };
  if (ir.k === "json") return { $ref: "#/$defs/JsonValue" };
  if (ir.k === "jsonObject") return { $ref: "#/$defs/JsonObject" };
  if (ir.k === "array") {
    const schema = { type: "array", items: schemaFor(ir.item, context) };
    if (maxItems.has(context)) schema.maxItems = maxItems.get(context);
    if (nonEmptyArrays.has(context)) schema.minItems = 1;
    return schema;
  }
  if (ir.k === "union") return { oneOf: ir.options.map((option) => schemaFor(option, context)) };
  throw new Error(`unsupported schema IR ${ir.k}`);
}

function propertySchema(owner, property) {
  const context = `${owner}.${property.name}`;
  const schema = schemaFor(property.type, context);
  if (semanticSegmentProperties.has(context)) {
    Object.assign(schema, { type: "string", pattern: segmentPattern, minLength: 1, maxLength: P.SEMANTIC_SEGMENT_MAX_LENGTH });
  }
  if (semanticNamespaceProperties.has(context)) {
    Object.assign(schema, { type: "string", pattern: namespacePattern, minLength: 1, maxLength: P.SEMANTIC_NAMESPACE_MAX_LENGTH });
  }
  if (context === "StudioNode.component") {
    Object.assign(schema, { type: "string", pattern: componentPattern, minLength: 3, maxLength: P.SEMANTIC_NAMESPACE_MAX_LENGTH });
  }
  if (safePropProperties.has(context)) {
    Object.assign(schema, { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$", minLength: 1, maxLength: 64 });
  }
  if (eventProperties.has(context)) {
    Object.assign(schema, { type: "string", minLength: 1, maxLength: C.STUDIO_EVENT_MAX_LENGTH, pattern: "^[^\\u0000-\\u001F\\u007F]+$" });
  }
  if (payloadKeyProperties.has(context)) {
    Object.assign(schema, { type: "string", pattern: "^[a-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$", minLength: 1, maxLength: P.SEMANTIC_SEGMENT_MAX_LENGTH });
  }
  if (context === "StudioNode.order") {
    Object.assign(schema, { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
  }
  return schema;
}

const definitions = {
  JsonValue: {
    description: `Canonical JSON value. Aggregate depth/node/string budgets (${J.JSON_VALUE_MAX_DEPTH}/${J.JSON_VALUE_MAX_NODES}/${J.JSON_VALUE_MAX_TOTAL_STRING_LENGTH}) remain semantic-validator constraints.`,
    oneOf: [
      { type: "null" },
      { type: "boolean" },
      { type: "number" },
      { type: "string", maxLength: J.JSON_VALUE_MAX_STRING_LENGTH },
      { type: "array", maxItems: J.JSON_VALUE_MAX_ARRAY_LENGTH, items: { $ref: "#/$defs/JsonValue" } },
      { $ref: "#/$defs/JsonObject" },
    ],
  },
  JsonObject: {
    type: "object",
    maxProperties: J.JSON_VALUE_MAX_OBJECT_KEYS,
    propertyNames: { maxLength: J.JSON_VALUE_MAX_OBJECT_KEY_LENGTH },
    additionalProperties: { $ref: "#/$defs/JsonValue" },
  },
};
for (const [name, model] of outputModels) {
  if (model.kind === "object") {
    const properties = {};
    const required = [];
    for (const property of model.props) {
      properties[property.name] = propertySchema(name, property);
      if (!property.optional) required.push(property.name);
    }
    definitions[name] = { type: "object", additionalProperties: false, properties, required };
  } else {
    definitions[name] = schemaFor(model.type, name);
  }
}

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.vira.dev/studio-experience/v1/studio-experience-document.schema.json",
  title: "Vira Studio Experience Document v1",
  description: "Generated structural/wire schema from the canonical TypeScript StudioExperienceDocument. Cross-field graph, uniqueness, scope-path and publication validity remain enforced by parseStudioExperienceDocument and conformance fixtures.",
  $ref: "#/$defs/StudioExperienceDocument",
  $defs: definitions,
};

const swiftReserved = new Set([
  "repeat", "associatedtype", "class", "deinit", "enum", "extension", "fileprivate", "func", "import", "init", "inout", "internal", "let", "open", "operator", "private", "protocol", "public", "rethrows", "static", "struct", "subscript", "typealias", "var", "break", "case", "continue", "default", "defer", "do", "else", "fallthrough", "for", "guard", "if", "in", "return", "switch", "where", "while", "as", "Any", "catch", "false", "is", "nil", "super", "self", "Self", "throw", "throws", "true", "try",
]);
function swiftIdentifier(name) {
  return swiftReserved.has(name) ? `\`${name}\`` : name;
}
function swiftType(ir) {
  if (ir.k === "string") return "String";
  if (ir.k === "number") return "Double";
  if (ir.k === "boolean") return "Bool";
  if (ir.k === "json") return "ViraJSONValue";
  if (ir.k === "jsonObject") return "[String: ViraJSONValue]";
  if (ir.k === "named") return ir.name;
  if (ir.k === "literal") return typeof ir.value === "string" ? "String" : "Double";
  if (ir.k === "array") return `[${swiftType(ir.item)}]`;
  if (ir.k === "union") {
    const literals = literalStringUnion(ir);
    if (literals) return "String";
    return "ViraJSONValue";
  }
  throw new Error(`unsupported Swift IR ${ir.k}`);
}
function discriminatorValues(objectName) {
  const model = outputModels.get(objectName);
  if (!model || model.kind !== "object") return [];
  const kind = model.props.find((property) => property.name === "kind");
  if (!kind) return [];
  if (kind.type.k === "literal" && typeof kind.type.value === "string") return [kind.type.value];
  if (kind.type.k === "named") {
    const alias = outputModels.get(kind.type.name);
    if (alias?.kind === "alias") return literalStringUnion(alias.type) ?? [];
  }
  return literalStringUnion(kind.type) ?? [];
}
function swiftDecodeLines(property) {
  const member = swiftIdentifier(property.name);
  const key = swiftIdentifier(property.name);
  const type = swiftType(property.type);
  if (property.optional) {
    return [`    self.${member} = try c.decodeIfPresent(${type}.self, forKey: .${key})`];
  }
  if (property.type.k === "literal" && typeof property.type.value === "string") {
    const expected = JSON.stringify(property.type.value);
    return [
      `    let ${property.name}Value = try c.decode(String.self, forKey: .${key})`,
      `    guard ${property.name}Value == ${expected} else { throw DecodingError.dataCorruptedError(forKey: .${key}, in: c, debugDescription: "expected literal ${property.type.value}") }`,
      `    self.${member} = ${property.name}Value`,
    ];
  }
  return [`    self.${member} = try c.decode(${type}.self, forKey: .${key})`];
}

function swiftModels() {
  const lines = [
    "// GENERATED FILE. DO NOT EDIT.",
    "// Source: packages/studio-schema/src/types.ts",
    "import Foundation",
    "",
    "private struct ViraAnyCodingKey: CodingKey {",
    "  let stringValue: String",
    "  let intValue: Int?",
    "  init?(stringValue: String) { self.stringValue = stringValue; self.intValue = nil }",
    "  init?(intValue: Int) { self.stringValue = String(intValue); self.intValue = intValue }",
    "}",
    "",
    "public enum ViraJSONValue: Codable, Equatable {",
    "  case null, bool(Bool), number(Double), string(String), array([ViraJSONValue]), object([String: ViraJSONValue])",
    "  public init(from decoder: Decoder) throws {",
    "    let c = try decoder.singleValueContainer()",
    "    if c.decodeNil() { self = .null; return }",
    "    if let v = try? c.decode(Bool.self) { self = .bool(v); return }",
    "    if let v = try? c.decode(Double.self) { self = .number(v); return }",
    "    if let v = try? c.decode(String.self) { self = .string(v); return }",
    "    if let v = try? c.decode([ViraJSONValue].self) { self = .array(v); return }",
    "    if let v = try? c.decode([String: ViraJSONValue].self) { self = .object(v); return }",
    "    throw DecodingError.dataCorruptedError(in: c, debugDescription: \"unsupported JSON value\")",
    "  }",
    "  public func encode(to encoder: Encoder) throws {",
    "    var c = encoder.singleValueContainer()",
    "    switch self { case .null: try c.encodeNil(); case .bool(let v): try c.encode(v); case .number(let v): try c.encode(v); case .string(let v): try c.encode(v); case .array(let v): try c.encode(v); case .object(let v): try c.encode(v) }",
    "  }",
    "}",
    "",
  ];
  for (const [name, model] of outputModels) {
    if (model.kind === "alias") {
      const literals = literalStringUnion(model.type);
      if (literals) {
        lines.push(`public enum ${name}: String, Codable, Equatable {`);
        for (const value of literals) {
          lines.push(`  case ${swiftIdentifier(value.replace(/-([a-z])/g, (_, character) => character.toUpperCase()))} = ${JSON.stringify(value)}`);
        }
        lines.push("}", "");
        continue;
      }
      if (model.type.k === "union" && model.type.options.every((option) => option.k === "named")) {
        lines.push(`public enum ${name}: Codable, Equatable {`);
        model.type.options.forEach((option, index) => lines.push(`  case variant${index}(${option.name})`));
        lines.push("  private enum CodingKeys: String, CodingKey { case kind }");
        lines.push("  public init(from decoder: Decoder) throws {");
        lines.push("    let c = try decoder.container(keyedBy: CodingKeys.self)");
        lines.push("    let kind = try c.decode(String.self, forKey: .kind)");
        model.type.options.forEach((option, index) => {
          const values = discriminatorValues(option.name);
          if (values.length === 0) throw new Error(`union ${name} option ${option.name} lacks kind discriminator`);
          lines.push(`    if ${JSON.stringify(values)}.contains(kind) { self = .variant${index}(try ${option.name}(from: decoder)); return }`);
        });
        lines.push("    throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: \"unsupported union discriminator\")");
        lines.push("  }");
        lines.push("  public func encode(to encoder: Encoder) throws { switch self {");
        model.type.options.forEach((option, index) => lines.push(`    case .variant${index}(let value): try value.encode(to: encoder)`));
        lines.push("  } }");
        lines.push("}", "");
        continue;
      }
      throw new Error(`unsupported Swift alias ${name}`);
    }

    lines.push(`public struct ${name}: Codable, Equatable {`);
    for (const property of model.props) {
      const optional = property.optional ? "?" : "";
      lines.push(`  public let ${swiftIdentifier(property.name)}: ${swiftType(property.type)}${optional}`);
    }
    lines.push(`  private enum CodingKeys: String, CodingKey { ${model.props.map((property) => `case ${swiftIdentifier(property.name)}`).join(", ")} }`);
    lines.push("  public init(from decoder: Decoder) throws {");
    lines.push("    let any = try decoder.container(keyedBy: ViraAnyCodingKey.self)");
    lines.push(`    let allowed: Set<String> = [${model.props.map((property) => JSON.stringify(property.name)).join(", ")}]`);
    lines.push("    if let unknown = any.allKeys.first(where: { !allowed.contains($0.stringValue) }) { throw DecodingError.dataCorruptedError(forKey: unknown, in: any, debugDescription: \"unknown field\") }");
    lines.push("    let c = try decoder.container(keyedBy: CodingKeys.self)");
    for (const property of model.props) lines.push(...swiftDecodeLines(property));
    lines.push("  }");
    lines.push("}", "");
  }
  return lines.join("\n");
}

function kotlinType(ir) {
  if (ir.k === "string") return "String";
  if (ir.k === "number") return "Double";
  if (ir.k === "boolean") return "Boolean";
  if (ir.k === "json") return "ViraJson";
  if (ir.k === "jsonObject") return "Map<String, ViraJson>";
  if (ir.k === "named") return ir.name;
  if (ir.k === "literal") return typeof ir.value === "string" ? "String" : "Double";
  if (ir.k === "array") return `List<${kotlinType(ir.item)}>`;
  if (ir.k === "union") {
    const literals = literalStringUnion(ir);
    if (literals) return "String";
    return "ViraJson";
  }
  throw new Error(`unsupported Kotlin IR ${ir.k}`);
}
function kotlinDecode(ir, expression) {
  if (ir.k === "string") return `${expression}.str()`;
  if (ir.k === "number") return `${expression}.num()`;
  if (ir.k === "boolean") return `((${expression}) as ViraJson.Bool).value`;
  if (ir.k === "json") return expression;
  if (ir.k === "jsonObject") return `${expression}.obj()`;
  if (ir.k === "literal" && typeof ir.value === "string") {
    return `${expression}.str().also { if (it != ${JSON.stringify(ir.value)}) error("expected literal ${ir.value}") }`;
  }
  if (ir.k === "named") {
    const model = outputModels.get(ir.name);
    if (model?.kind === "alias" && literalStringUnion(model.type)) return `${ir.name}.fromWire(${expression}.str())`;
    if (model?.kind === "alias") return `decode${ir.name}(${expression})`;
    return `decode${ir.name}(${expression})`;
  }
  if (ir.k === "array") return `${expression}.arr().map { ${kotlinDecode(ir.item, "it")} }`;
  if (ir.k === "union") {
    const literals = literalStringUnion(ir);
    if (literals) return `${expression}.str().also { if (it !in setOf(${literals.map((value) => JSON.stringify(value)).join(", ")})) error("invalid literal union") }`;
    return expression;
  }
  throw new Error(`unsupported Kotlin decode IR ${ir.k}`);
}
function kotlinEncode(ir, expression) {
  if (ir.k === "string" || (ir.k === "literal" && typeof ir.value === "string")) return `ViraJson.Str(${expression})`;
  if (ir.k === "number") return `ViraJson.Num(${expression})`;
  if (ir.k === "boolean") return `ViraJson.Bool(${expression})`;
  if (ir.k === "json") return expression;
  if (ir.k === "jsonObject") return `ViraJson.Obj(${expression})`;
  if (ir.k === "named") {
    const model = outputModels.get(ir.name);
    if (model?.kind === "alias" && literalStringUnion(model.type)) return `ViraJson.Str(${expression}.wire)`;
    if (model?.kind === "alias") return `encode${ir.name}(${expression})`;
    return `encode${ir.name}(${expression})`;
  }
  if (ir.k === "array") return `ViraJson.Arr(${expression}.map { ${kotlinEncode(ir.item, "it")} })`;
  if (ir.k === "union" && literalStringUnion(ir)) return `ViraJson.Str(${expression})`;
  throw new Error(`unsupported Kotlin encode IR ${ir.k}`);
}

function kotlinModels() {
  const lines = [
    "// GENERATED FILE. DO NOT EDIT.",
    "// Source: packages/studio-schema/src/types.ts",
    "",
    "sealed interface ViraJson {",
    "  data object Null: ViraJson",
    "  data class Bool(val value:Boolean): ViraJson",
    "  data class Num(val value:Double): ViraJson",
    "  data class Str(val value:String): ViraJson",
    "  data class Arr(val value:List<ViraJson>): ViraJson",
    "  data class Obj(val value:Map<String,ViraJson>): ViraJson",
    "}",
    "",
    "private fun ViraJson.obj(): Map<String,ViraJson> = (this as? ViraJson.Obj)?.value ?: error(\"expected object\")",
    "private fun Map<String,ViraJson>.req(key:String): ViraJson = this[key] ?: error(\"missing $key\")",
    "private fun ViraJson.str(): String = (this as? ViraJson.Str)?.value ?: error(\"expected string\")",
    "private fun ViraJson.num(): Double = (this as? ViraJson.Num)?.value ?: error(\"expected number\")",
    "private fun ViraJson.arr(): List<ViraJson> = (this as? ViraJson.Arr)?.value ?: error(\"expected array\")",
    "private fun strict(value:Map<String,ViraJson>, allowed:Set<String>) { val unknown=value.keys.firstOrNull { it !in allowed }; if (unknown != null) error(\"unknown field $unknown\") }",
    "",
  ];

  for (const [name, model] of outputModels) {
    if (model.kind === "alias") {
      const literals = literalStringUnion(model.type);
      if (literals) {
        lines.push(`enum class ${name}(val wire:String) {`);
        lines.push(literals.map((value) => `  ${value.toUpperCase().replaceAll("-", "_")}(${JSON.stringify(value)})`).join(",\n"));
        lines.push(`; companion object { fun fromWire(value:String)=entries.firstOrNull { it.wire == value } ?: error("invalid ${name}") }`);
        lines.push("}", "");
        continue;
      }
      if (model.type.k === "union" && model.type.options.every((option) => option.k === "named")) {
        lines.push(`sealed interface ${name} {`);
        model.type.options.forEach((option, index) => lines.push(`  data class Variant${index}(val value:${option.name}): ${name}`));
        lines.push("}", "");
        continue;
      }
      throw new Error(`unsupported Kotlin alias ${name}`);
    }
    lines.push(`data class ${name}(`);
    lines.push(model.props.map((property) => `  val ${property.name}: ${kotlinType(property.type)}${property.optional ? "? = null" : ""}`).join(",\n"));
    lines.push(")", "");
  }

  lines.push("object ViraStudioCodec {");
  lines.push("  fun decodeDocument(text:String): StudioExperienceDocument = decodeStudioExperienceDocument(JsonParser(text).parse())");
  lines.push("  fun encodeDocument(value:StudioExperienceDocument): String = JsonWriter.write(encodeStudioExperienceDocument(value))");

  for (const [name, model] of outputModels) {
    if (model.kind === "alias" && model.type.k === "union" && model.type.options.every((option) => option.k === "named")) {
      lines.push(`  private fun decode${name}(json:ViraJson): ${name} { val objectValue=json.obj(); val kind=objectValue.req("kind").str()`);
      model.type.options.forEach((option, index) => {
        const values = discriminatorValues(option.name);
        if (values.length === 0) throw new Error(`union ${name} option ${option.name} lacks kind discriminator`);
        lines.push(`    if (${values.map((value) => `kind == ${JSON.stringify(value)}`).join(" || ")}) return ${name}.Variant${index}(decode${option.name}(json))`);
      });
      lines.push(`    error("unsupported ${name} discriminator: $kind")`);
      lines.push("  }");
      lines.push(`  private fun encode${name}(value:${name}): ViraJson = when(value) {`);
      model.type.options.forEach((option, index) => lines.push(`    is ${name}.Variant${index} -> encode${option.name}(value.value)`));
      lines.push("  }");
    }
  }

  for (const [name, model] of outputModels) {
    if (model.kind !== "object") continue;
    const allowed = model.props.map((property) => JSON.stringify(property.name)).join(", ");
    lines.push(`  private fun decode${name}(json:ViraJson): ${name} { val objectValue=json.obj(); strict(objectValue, setOf(${allowed})); return ${name}(`);
    lines.push(model.props.map((property) => {
      const sourceExpression = property.optional
        ? `objectValue[${JSON.stringify(property.name)}]?.let { ${kotlinDecode(property.type, "it")} }`
        : kotlinDecode(property.type, `objectValue.req(${JSON.stringify(property.name)})`);
      return `    ${property.name} = ${sourceExpression}`;
    }).join(",\n"));
    lines.push("  ) }");
    lines.push(`  private fun encode${name}(value:${name}): ViraJson.Obj { val result=linkedMapOf<String,ViraJson>()`);
    for (const property of model.props) {
      if (property.optional) {
        lines.push(`    value.${property.name}?.let { result[${JSON.stringify(property.name)}] = ${kotlinEncode(property.type, "it")} }`);
      } else {
        lines.push(`    result[${JSON.stringify(property.name)}] = ${kotlinEncode(property.type, `value.${property.name}`)}`);
      }
    }
    lines.push("    return ViraJson.Obj(result)");
    lines.push("  }");
  }
  lines.push("}", "");

  lines.push(
    "private class JsonParser(private val source:String) {",
    "  private var index=0",
    "  fun parse():ViraJson { val value=parseValue(); whitespace(); if(index!=source.length) error(\"trailing json\"); return value }",
    "  private fun whitespace(){ while(index<source.length && source[index].isWhitespace()) index++ }",
    "  private fun parseValue():ViraJson { whitespace(); if(index>=source.length) error(\"eof\"); return when(source[index]) {",
    "    '{'->parseObject(); '['->parseArray(); '\"'->ViraJson.Str(parseString()); 't'->{literal(\"true\");ViraJson.Bool(true)}; 'f'->{literal(\"false\");ViraJson.Bool(false)}; 'n'->{literal(\"null\");ViraJson.Null}; else->parseNumber() } }",
    "  private fun literal(value:String){ if(!source.startsWith(value,index)) error(\"bad literal\"); index+=value.length }",
    "  private fun parseObject():ViraJson.Obj { index++; whitespace(); val result=linkedMapOf<String,ViraJson>(); if(index<source.length&&source[index]=='}'){index++;return ViraJson.Obj(result)}; while(true){ whitespace(); val key=parseString(); whitespace(); if(index>=source.length||source[index++]!=':')error(\"colon\"); if(result.put(key,parseValue())!=null)error(\"duplicate key\"); whitespace(); if(index<source.length&&source[index]=='}'){index++;break}; if(index>=source.length||source[index++]!=',')error(\"comma\")}; return ViraJson.Obj(result) }",
    "  private fun parseArray():ViraJson.Arr { index++; whitespace(); val result=mutableListOf<ViraJson>(); if(index<source.length&&source[index]==']'){index++;return ViraJson.Arr(result)}; while(true){result+=parseValue();whitespace();if(index<source.length&&source[index]==']'){index++;break};if(index>=source.length||source[index++]!=',')error(\"comma\")};return ViraJson.Arr(result)}",
    "  private fun parseString():String { if(index>=source.length||source[index++]!='\"')error(\"quote\"); val result=StringBuilder(); while(index<source.length){ val character=source[index++]; if(character=='\"') return result.toString(); if(character.code<0x20) error(\"raw control character\"); if(character=='\\\\'){ if(index>=source.length)error(\"escape\"); when(val escaped=source[index++]){'\"'->result.append('\"');'\\\\'->result.append('\\\\');'/'->result.append('/');'b'->result.append('\\b');'f'->result.append('\\u000C');'n'->result.append('\\n');'r'->result.append('\\r');'t'->result.append('\\t');'u'->{ if(index+4>source.length)error(\"unicode\");result.append(source.substring(index,index+4).toInt(16).toChar());index+=4};else->error(\"escape $escaped\") } } else result.append(character)};error(\"unterminated\") }",
    "  private fun parseNumber():ViraJson.Num { val start=index; if(source[index]=='-')index++; if(index>=source.length)error(\"number\"); if(source[index]=='0'){index++; if(index<source.length&&source[index].isDigit())error(\"leading zero\")} else { if(!source[index].isDigit())error(\"number\"); while(index<source.length&&source[index].isDigit())index++ }; if(index<source.length&&source[index]=='.'){index++; val fractionStart=index; while(index<source.length&&source[index].isDigit())index++; if(index==fractionStart)error(\"fraction\")}; if(index<source.length&&(source[index]=='e'||source[index]=='E')){index++;if(index<source.length&&(source[index]=='+'||source[index]=='-'))index++;val exponentStart=index;while(index<source.length&&source[index].isDigit())index++;if(index==exponentStart)error(\"exponent\")}; val number=source.substring(start,index).toDouble(); if(!number.isFinite() || number == -0.0) error(\"non-canonical number\"); return ViraJson.Num(number) }",
    "}",
    "",
    "private object JsonWriter {",
    "  fun write(value:ViraJson):String=when(value){",
    "    ViraJson.Null->\"null\"; is ViraJson.Bool->if(value.value)\"true\" else \"false\"; is ViraJson.Num->{ val number=value.value; if(number%1.0==0.0) number.toLong().toString() else number.toString() }; is ViraJson.Str->quote(value.value); is ViraJson.Arr->value.value.joinToString(prefix=\"[\",postfix=\"]\",separator=\",\"){write(it)}; is ViraJson.Obj->value.value.entries.joinToString(prefix=\"{\",postfix=\"}\",separator=\",\"){quote(it.key)+\":\"+write(it.value)} }",
    "  private fun quote(value:String):String { val result=StringBuilder(\"\\\"\"); for(character in value){ when(character){ '\"'->result.append(\"\\\\\\\"\"); '\\\\'->result.append(\"\\\\\\\\\"); '\\b'->result.append(\"\\\\b\"); '\\u000C'->result.append(\"\\\\f\"); '\\n'->result.append(\"\\\\n\"); '\\r'->result.append(\"\\\\r\"); '\\t'->result.append(\"\\\\t\"); else->if(character.code<0x20)result.append(\"\\\\u%04x\".format(character.code)) else result.append(character) } }; return result.append('\"').toString() }",
    "}",
  );
  return lines.join("\n");
}

const outputs = new Map([
  [path.join(outRoot, "schema/studio-experience-document.schema.json"), `${JSON.stringify(schema, null, 2)}\n`],
  [path.join(outRoot, "swift/StudioExperienceModels.swift"), `${swiftModels()}\n`],
  [path.join(outRoot, "kotlin/StudioExperienceModels.kt"), `${kotlinModels()}\n`],
]);
const digest = crypto.createHash("sha256").update(sourceText).update(semanticText).update(jsonValueText).digest("hex");
outputs.set(path.join(outRoot, "SOURCE_DIGEST"), `${digest}\n`);

let drift = false;
for (const [file, content] of outputs) {
  if (check) {
    if (!fs.existsSync(file) || read(file) !== content) {
      console.error(`generated artifact drift: ${path.relative(root, file)}`);
      drift = true;
    }
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(`generated ${path.relative(root, file)}`);
  }
}
if (drift) process.exit(1);
