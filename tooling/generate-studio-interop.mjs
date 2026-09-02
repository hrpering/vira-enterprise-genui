import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = process.cwd();
const typesPath = path.join(root, 'packages/studio-schema/src/types.ts');
const semanticPath = path.join(root, 'packages/protocol/src/semantic-id.ts');
const jsonValuePath = path.join(root, 'packages/protocol/src/json-value.ts');
const outRoot = path.join(root, 'interop/studio-experience/v1');
const check = process.argv.includes('--check');

const read = (p) => fs.readFileSync(p, 'utf8');
const sourceText = read(typesPath);
const semanticText = read(semanticPath);
const jsonValueText = read(jsonValuePath);
const source = ts.createSourceFile(typesPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function literalConst(name, text=sourceText) {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*([^;]+?)\\s+as\\s+const`);
  const m = text.match(re);
  if (!m) throw new Error(`missing canonical const ${name}`);
  const raw = m[1].replaceAll('_','').trim();
  if (/^".*"$/.test(raw)) return JSON.parse(raw);
  if (/^\d+$/.test(raw)) return Number(raw);
  throw new Error(`unsupported const ${name}: ${m[1]}`);
}
const C = Object.fromEntries([
  'STUDIO_DOCUMENT_VERSION','STUDIO_MAX_VIEWS','STUDIO_MAX_NODES_PER_VIEW','STUDIO_MAX_BINDINGS','STUDIO_MAX_INTERACTIONS','STUDIO_MAX_ACTION_PAYLOAD_BINDINGS','STUDIO_EVENT_MAX_LENGTH'
].map(k=>[k,literalConst(k)]));
const P = Object.fromEntries(['SEMANTIC_SEGMENT_MAX_LENGTH','SEMANTIC_NAMESPACE_MAX_LENGTH'].map(k=>[k,literalConst(k, semanticText)]));
const J = Object.fromEntries(['JSON_VALUE_MAX_DEPTH','JSON_VALUE_MAX_NODES','JSON_VALUE_MAX_ARRAY_LENGTH','JSON_VALUE_MAX_OBJECT_KEYS','JSON_VALUE_MAX_OBJECT_KEY_LENGTH','JSON_VALUE_MAX_STRING_LENGTH','JSON_VALUE_MAX_TOTAL_STRING_LENGTH'].map(k=>[k,literalConst(k, jsonValueText)]));
const segPattern = '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$';
const nsPattern = '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$';

const interfaces = new Map();
const aliases = new Map();
for (const stmt of source.statements) {
  if (ts.isInterfaceDeclaration(stmt) && stmt.name.text.startsWith('Studio')) interfaces.set(stmt.name.text, stmt);
  if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text.startsWith('Studio') && !stmt.name.text.includes('Validation') && !stmt.name.text.endsWith('Result')) aliases.set(stmt.name.text, stmt);
}
if (!interfaces.has('StudioExperienceDocument')) throw new Error('canonical StudioExperienceDocument not found');

const synthetic = new Map();
function synthName(owner, prop, suffix='') {
  return `${owner}${prop[0].toUpperCase()}${prop.slice(1)}${suffix}`;
}
function typeIR(node, owner='Anonymous', prop='value') {
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText(source);
    if (name === 'JsonValue') return {k:'json'};
    if (name === 'JsonObject') return {k:'jsonObject'};
    return {k:'named', name};
  }
  if (node.kind === ts.SyntaxKind.StringKeyword) return {k:'string'};
  if (node.kind === ts.SyntaxKind.NumberKeyword) return {k:'number'};
  if (node.kind === ts.SyntaxKind.BooleanKeyword) return {k:'boolean'};
  if (ts.isLiteralTypeNode(node)) {
    if (ts.isStringLiteral(node.literal)) return {k:'literal', value:node.literal.text};
    if (node.literal.kind === ts.SyntaxKind.NullKeyword) return {k:'null'};
    throw new Error(`unsupported literal ${node.getText(source)}`);
  }
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword && ts.isArrayTypeNode(node.type)) return {k:'array', item:typeIR(node.type.elementType, owner, prop)};
  if (ts.isArrayTypeNode(node)) return {k:'array', item:typeIR(node.elementType, owner, prop)};
  if (ts.isTypeQueryNode(node)) {
    const n = node.exprName.getText(source);
    if (!(n in C)) throw new Error(`unsupported typeof ${n}`);
    return {k:'literal', value:C[n]};
  }
  if (ts.isUnionTypeNode(node)) return {k:'union', options:node.types.map((t,i)=>typeIR(t,owner,`${prop}${i}`))};
  if (ts.isTypeLiteralNode(node)) {
    const name = synthName(owner, prop);
    if (!synthetic.has(name)) synthetic.set(name, membersIR(node.members, name));
    return {k:'named', name};
  }
  throw new Error(`unsupported type ${node.getText(source)}`);
}
function membersIR(members, owner) {
  return members.map(m => {
    if (!ts.isPropertySignature(m) || !m.type || !m.name) throw new Error(`unsupported member in ${owner}`);
    const name = m.name.getText(source).replace(/^['"]|['"]$/g,'');
    return {name, optional:!!m.questionToken, type:typeIR(m.type, owner, name)};
  });
}
const models = new Map();
for (const [name,node] of interfaces) models.set(name,{kind:'object', props:membersIR(node.members,name)});
for (const [name,node] of aliases) models.set(name,{kind:'alias', type:typeIR(node.type,name,'value')});
for (const [name,props] of synthetic) models.set(name,{kind:'object', props});

function expectModel(name, props) {
  const m=models.get(name); if(!m||m.kind!=='object') throw new Error(`missing ${name}`);
  const got=m.props.map(p=>p.name).join(','); if(got!==props.join(',')) throw new Error(`canonical ${name} fields changed: ${got}`);
}
expectModel('StudioExperienceDocument',['version','id','recipeId','entryView','views','bindings','interactions']);

const maxItems = new Map([
  ['StudioExperienceDocument.views', C.STUDIO_MAX_VIEWS],
  ['StudioExperienceDocument.bindings', C.STUDIO_MAX_BINDINGS],
  ['StudioExperienceDocument.interactions', C.STUDIO_MAX_INTERACTIONS],
  ['StudioView.nodes', C.STUDIO_MAX_NODES_PER_VIEW],
  ['StudioInteraction.payloadBindings', C.STUDIO_MAX_ACTION_PAYLOAD_BINDINGS],
]);
const nonEmptyArrays = new Set(['StudioExperienceDocument.views','StudioView.nodes']);
const semanticSegmentProps = new Set(['StudioView.id','StudioNode.id','StudioNode.parentId','StudioNode.slot','StudioExperienceDocument.entryView']);
const semanticNamespaceProps = new Set(['StudioExperienceDocument.id','StudioExperienceDocument.recipeId','StudioNode.component']);
const safePropProps = new Set(['StudioBinding.prop']);
const eventProps = new Set(['StudioInteraction.event','StudioInteraction.actionEvent']);
const payloadKeyProps = new Set(['StudioInteractionPayloadBinding.key']);

function schemaFor(ir, ctx='') {
  if(ir.k==='string') return {type:'string'};
  if(ir.k==='number') return {type:'number'};
  if(ir.k==='boolean') return {type:'boolean'};
  if(ir.k==='null') return {type:'null'};
  if(ir.k==='literal') return {const:ir.value};
  if(ir.k==='named') return {$ref:`#/$defs/${ir.name}`};
  if(ir.k==='json') return {$ref:'#/$defs/JsonValue'};
  if(ir.k==='jsonObject') return {$ref:'#/$defs/JsonObject'};
  if(ir.k==='array') { const s={type:'array',items:schemaFor(ir.item,ctx)}; if(maxItems.has(ctx))s.maxItems=maxItems.get(ctx); if(nonEmptyArrays.has(ctx))s.minItems=1; return s; }
  if(ir.k==='union') return {oneOf:ir.options.map(x=>schemaFor(x,ctx))};
  throw new Error(`schema unsupported ${ir.k}`);
}
function propertySchema(owner,p) {
  const ctx=`${owner}.${p.name}`; const s=schemaFor(p.type,ctx);
  if(semanticSegmentProps.has(ctx)) Object.assign(s,{type:'string',pattern:segPattern,minLength:1,maxLength:P.SEMANTIC_SEGMENT_MAX_LENGTH});
  if(semanticNamespaceProps.has(ctx)) Object.assign(s,{type:'string',pattern:nsPattern,minLength:1,maxLength:P.SEMANTIC_NAMESPACE_MAX_LENGTH});
  if(safePropProps.has(ctx)) Object.assign(s,{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,63}$',minLength:1,maxLength:64});
  if(eventProps.has(ctx)) Object.assign(s,{type:'string',minLength:1,maxLength:C.STUDIO_EVENT_MAX_LENGTH,pattern:'^[^\\u0000-\\u001F\\u007F].*$'});
  if(payloadKeyProps.has(ctx)) Object.assign(s,{type:'string',pattern:'^[a-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$',minLength:1,maxLength:P.SEMANTIC_SEGMENT_MAX_LENGTH});
  if(ctx==='StudioNode.order') Object.assign(s,{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER});
  return s;
}
const defs={};
defs.JsonValue={description:`Canonical JSON value. Aggregate depth/node/string budgets (${J.JSON_VALUE_MAX_DEPTH}/${J.JSON_VALUE_MAX_NODES}/${J.JSON_VALUE_MAX_TOTAL_STRING_LENGTH}) remain semantic-validator constraints.`,oneOf:[{type:'null'},{type:'boolean'},{type:'number'},{type:'string',maxLength:J.JSON_VALUE_MAX_STRING_LENGTH},{type:'array',maxItems:J.JSON_VALUE_MAX_ARRAY_LENGTH,items:{$ref:'#/$defs/JsonValue'}},{$ref:'#/$defs/JsonObject'}]};
defs.JsonObject={type:'object',maxProperties:J.JSON_VALUE_MAX_OBJECT_KEYS,propertyNames:{maxLength:J.JSON_VALUE_MAX_OBJECT_KEY_LENGTH},additionalProperties:{$ref:'#/$defs/JsonValue'}};
for (const [name,m] of [...models].sort(([a],[b])=>a.localeCompare(b))) {
  if(m.kind==='object') { const properties={}; const required=[]; for(const p of m.props){properties[p.name]=propertySchema(name,p);if(!p.optional)required.push(p.name);} defs[name]={type:'object',additionalProperties:false,properties,required}; }
  else defs[name]=schemaFor(m.type,name);
}
const schema={
  $schema:'https://json-schema.org/draft/2020-12/schema',
  $id:'https://schemas.vira.dev/studio-experience/v1/studio-experience-document.schema.json',
  title:'Vira Studio Experience Document v1',
  description:'Generated structural/wire schema from the canonical TypeScript StudioExperienceDocument. Cross-field graph, uniqueness, scope-path and publication validity remain enforced by parseStudioExperienceDocument and conformance fixtures.',
  $ref:'#/$defs/StudioExperienceDocument',$defs:defs
};

function swiftIdent(name){ return new Set(['repeat','associatedtype','class','deinit','enum','extension','fileprivate','func','import','init','inout','internal','let','open','operator','private','protocol','public','rethrows','static','struct','subscript','typealias','var','break','case','continue','default','defer','do','else','fallthrough','for','guard','if','in','repeat','return','switch','where','while','as','Any','catch','false','is','nil','super','self','Self','throw','throws','true','try']).has(name) ? `\`${name}\`` : name; }
function swiftType(ir){
  if(ir.k==='string')return 'String'; if(ir.k==='number')return 'Double'; if(ir.k==='boolean')return 'Bool'; if(ir.k==='json')return 'ViraJSONValue'; if(ir.k==='jsonObject')return '[String: ViraJSONValue]'; if(ir.k==='named')return ir.name; if(ir.k==='literal')return typeof ir.value==='string'?'String':'Double'; if(ir.k==='array')return `[${swiftType(ir.item)}]`; if(ir.k==='union') { const lits=ir.options.every(o=>o.k==='literal'&&typeof o.value==='string'); if(lits)return 'String'; return 'ViraJSONValue'; } throw new Error('swift type');
}
function literalSetForObjectName(name){
  const m=models.get(name); if(!m||m.kind!=='object') return [];
  const k=m.props.find(p=>p.name==='kind'); if(!k) return [];
  const ir=k.type;
  if(ir.k==='literal'&&typeof ir.value==='string') return [ir.value];
  if(ir.k==='named') { const a=models.get(ir.name); if(a?.kind==='alias'&&a.type.k==='union') return a.type.options.filter(o=>o.k==='literal'&&typeof o.value==='string').map(o=>o.value); }
  if(ir.k==='union') return ir.options.filter(o=>o.k==='literal'&&typeof o.value==='string').map(o=>o.value);
  return [];
}
function swiftModels(){
  const lines=['// GENERATED FILE. DO NOT EDIT.','// Source: packages/studio-schema/src/types.ts','import Foundation','','public enum ViraJSONValue: Codable, Equatable {','  case null, bool(Bool), number(Double), string(String), array([ViraJSONValue]), object([String: ViraJSONValue])','  public init(from decoder: Decoder) throws {','    let c = try decoder.singleValueContainer()','    if c.decodeNil() { self = .null; return }','    if let v = try? c.decode(Bool.self) { self = .bool(v); return }','    if let v = try? c.decode(Double.self) { self = .number(v); return }','    if let v = try? c.decode(String.self) { self = .string(v); return }','    if let v = try? c.decode([ViraJSONValue].self) { self = .array(v); return }','    if let v = try? c.decode([String: ViraJSONValue].self) { self = .object(v); return }','    throw DecodingError.dataCorruptedError(in: c, debugDescription: "unsupported JSON value")','  }','  public func encode(to encoder: Encoder) throws {','    var c = encoder.singleValueContainer()','    switch self { case .null: try c.encodeNil(); case .bool(let v): try c.encode(v); case .number(let v): try c.encode(v); case .string(let v): try c.encode(v); case .array(let v): try c.encode(v); case .object(let v): try c.encode(v) }','  }','}','','public enum ViraStudioInteropError: Error { case invalidVersion(String) }',''];
  for(const [name,m] of [...models].sort(([a],[b])=>a.localeCompare(b))){
    if(m.kind==='alias'){
      if(m.type.k==='union'&&m.type.options.every(o=>o.k==='literal'&&typeof o.value==='string')) {
        lines.push(`public enum ${name}: String, Codable, Equatable {`); for(const o of m.type.options) lines.push(`  case ${o.value.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())} = ${JSON.stringify(o.value)}`); lines.push('}','');
      } else if(m.type.k==='union'&&m.type.options.every(o=>o.k==='named')) {
        lines.push(`public enum ${name}: Codable, Equatable {`);
        m.type.options.forEach((o,i)=>lines.push(`  case variant${i}(${o.name})`));
        lines.push('  private enum CodingKeys: String, CodingKey { case kind }');
        lines.push('  public init(from decoder: Decoder) throws {');
        lines.push('    let c = try decoder.container(keyedBy: CodingKeys.self)');
        lines.push('    let kind = try c.decode(String.self, forKey: .kind)');
        m.type.options.forEach((o,i)=>{ const vals=literalSetForObjectName(o.name); if(!vals.length) throw new Error(`union ${name} option ${o.name} lacks kind discriminant`); lines.push(`    if ${JSON.stringify(vals)}.contains(kind) { self = .variant${i}(try ${o.name}(from: decoder)); return }`); });
        lines.push('    throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "unsupported union discriminator")','  }');
        lines.push('  public func encode(to encoder: Encoder) throws { switch self {');
        m.type.options.forEach((o,i)=>lines.push(`    case .variant${i}(let v): try v.encode(to: encoder)`));
        lines.push('  } }','}','');
      } else throw new Error(`unsupported Swift alias ${name}`);
      continue;
    }
    if(name==='StudioExperienceDocument') {
      lines.push(`public struct ${name}: Codable, Equatable {`);
      for(const p of m.props){let t=swiftType(p.type);if(p.optional)t+='?';lines.push(`  public let ${swiftIdent(p.name)}: ${t}`);}
      lines.push('  private enum CodingKeys: String, CodingKey { case version, id, recipeId, entryView, views, bindings, interactions }');
      lines.push('  public init(from decoder: Decoder) throws {');
      lines.push('    let c = try decoder.container(keyedBy: CodingKeys.self)');
      lines.push('    let version = try c.decode(String.self, forKey: .version)');
      lines.push(`    guard version == ${JSON.stringify(C.STUDIO_DOCUMENT_VERSION)} else { throw ViraStudioInteropError.invalidVersion(version) }`);
      lines.push('    self.version = version');
      for(const p of m.props.filter(p=>p.name!=='version')) { const t=swiftType(p.type); if(p.optional) lines.push(`    self.${p.name} = try c.decodeIfPresent(${t}.self, forKey: .${p.name})`); else lines.push(`    self.${p.name} = try c.decode(${t}.self, forKey: .${p.name})`); }
      lines.push('  }','}','');
    } else {
      lines.push(`public struct ${name}: Codable, Equatable {`);
      for(const p of m.props){let t=swiftType(p.type);if(p.optional)t+='?';lines.push(`  public let ${swiftIdent(p.name)}: ${t}`);}
      lines.push('}','','');
    }
  }
  return lines.join('\n');
}

// Kotlin uses generated data classes plus a small strict JSON codec so CI needs no third-party runtime.
function ktType(ir){
  if(ir.k==='string')return 'String'; if(ir.k==='number')return 'Double'; if(ir.k==='boolean')return 'Boolean'; if(ir.k==='json')return 'ViraJson'; if(ir.k==='jsonObject')return 'Map<String, ViraJson>'; if(ir.k==='named')return ir.name; if(ir.k==='literal')return typeof ir.value==='string'?'String':'Double'; if(ir.k==='array')return `List<${ktType(ir.item)}>`; if(ir.k==='union'){if(ir.options.every(o=>o.k==='literal'&&typeof o.value==='string'))return 'String';return 'ViraJson';} throw new Error('kt type');
}
function kotlinModels(){
  const lines=['// GENERATED FILE. DO NOT EDIT.','// Source: packages/studio-schema/src/types.ts','','sealed interface ViraJson {','  data object Null: ViraJson','  data class Bool(val value:Boolean): ViraJson','  data class Num(val value:Double): ViraJson','  data class Str(val value:String): ViraJson','  data class Arr(val value:List<ViraJson>): ViraJson','  data class Obj(val value:Map<String,ViraJson>): ViraJson','}','','private fun ViraJson.obj(): Map<String,ViraJson> = (this as? ViraJson.Obj)?.value ?: error("expected object")','private fun Map<String,ViraJson>.req(k:String): ViraJson = this[k] ?: error("missing $k")','private fun ViraJson.str(): String = (this as? ViraJson.Str)?.value ?: error("expected string")','private fun ViraJson.num(): Double = (this as? ViraJson.Num)?.value ?: error("expected number")','private fun ViraJson.arr(): List<ViraJson> = (this as? ViraJson.Arr)?.value ?: error("expected array")',''];
  for(const [name,m] of [...models].sort(([a],[b])=>a.localeCompare(b))){
    if(m.kind==='alias'){
      if(m.type.k==='union'&&m.type.options.every(o=>o.k==='literal'&&typeof o.value==='string')) {
        lines.push(`enum class ${name}(val wire:String) {`); lines.push(m.type.options.map(o=>`  ${o.value.toUpperCase().replaceAll('-','_')}(${JSON.stringify(o.value)})`).join(',\n')); lines.push(`; companion object { fun fromWire(v:String)=entries.firstOrNull{it.wire==v}?:error("invalid ${name}") }`,'}','');
      } else if(m.type.k==='union'&&m.type.options.every(o=>o.k==='named')) {
        lines.push(`sealed interface ${name} {`); m.type.options.forEach((o,i)=>lines.push(`  data class Variant${i}(val value:${o.name}): ${name}`)); lines.push('}','');
      } else throw new Error(`unsupported Kotlin alias ${name}`);
      continue;
    }
    lines.push(`data class ${name}(`); lines.push(m.props.map(p=>`  val ${p.name}: ${ktType(p.type)}${p.optional?'? = null':''}`).join(',\n')); lines.push(')','');
  }
  lines.push(`object ViraStudioCodec {\n  fun decodeDocument(text:String): StudioExperienceDocument { val j=JsonParser(text).parse(); return decodeStudioExperienceDocument(j) }\n  fun encodeDocument(v:StudioExperienceDocument): String = JsonWriter.write(encodeStudioExperienceDocument(v))\n`);
  function dec(ir, expr, owner, prop){
    if(ir.k==='string'||ir.k==='literal') return `${expr}.str()`;
    if(ir.k==='number') return `${expr}.num()`;
    if(ir.k==='boolean') return `((${expr}) as ViraJson.Bool).value`;
    if(ir.k==='json') return expr;
    if(ir.k==='jsonObject') return `${expr}.obj()`;
    if(ir.k==='named') {
      const am=models.get(ir.name);
      if(am?.kind==='alias'&&am.type.k==='union'&&am.type.options.every(o=>o.k==='literal')) return `${ir.name}.fromWire(${expr}.str())`;
      if(am?.kind==='alias'&&am.type.k==='union'&&am.type.options.every(o=>o.k==='named')) return `decode${ir.name}(${expr})`;
      return `decode${ir.name}(${expr})`;
    }
    if(ir.k==='array') return `${expr}.arr().map { ${dec(ir.item,'it',owner,prop)} }`;
    if(ir.k==='union') { if(ir.options.every(o=>o.k==='literal')) return `${expr}.str()`; return expr; }
    throw new Error('dec');
  }
  function enc(ir, expr){
    if(ir.k==='string'||ir.k==='literal') return `ViraJson.Str(${expr})`;
    if(ir.k==='number') return `ViraJson.Num(${expr})`;
    if(ir.k==='boolean') return `ViraJson.Bool(${expr})`;
    if(ir.k==='json') return expr;
    if(ir.k==='jsonObject') return `ViraJson.Obj(${expr})`;
    if(ir.k==='named') {
      const am=models.get(ir.name);
      if(am?.kind==='alias'&&am.type.k==='union'&&am.type.options.every(o=>o.k==='literal')) return `ViraJson.Str(${expr}.wire)`;
      if(am?.kind==='alias'&&am.type.k==='union'&&am.type.options.every(o=>o.k==='named')) return `encode${ir.name}(${expr})`;
      return `encode${ir.name}(${expr})`;
    }
    if(ir.k==='array') return `ViraJson.Arr(${expr}.map { ${enc(ir.item,'it')} })`;
    if(ir.k==='union'){if(ir.options.every(o=>o.k==='literal'))return `ViraJson.Str(${expr})`;return expr;}
    throw new Error('enc');
  }
  for(const [name,m] of [...models].sort(([a],[b])=>a.localeCompare(b))){
    if(m.kind==='alias'&&m.type.k==='union'&&m.type.options.every(o=>o.k==='named')) {
      lines.push(`  private fun decode${name}(j:ViraJson): ${name} { val o=j.obj(); val kind=o.req("kind").str();`);
      m.type.options.forEach((o,i)=>{ const vals=literalSetForObjectName(o.name); if(!vals.length) throw new Error(`union ${name} option ${o.name} lacks kind discriminant`); const cond=vals.map(v=>`kind==${JSON.stringify(v)}`).join(' || '); lines.push(`    if (${cond}) return ${name}.Variant${i}(decode${o.name}(j))`); });
      lines.push(`    error("unsupported ${name} discriminator: $kind")\n  }`);
      lines.push(`  private fun encode${name}(v:${name}): ViraJson = when(v) {`); m.type.options.forEach((o,i)=>lines.push(`    is ${name}.Variant${i} -> encode${o.name}(v.value)`)); lines.push('  }');
    }
  }
  for(const [name,m] of [...models].sort(([a],[b])=>a.localeCompare(b))){
    if(m.kind!=='object')continue;
    if(name==='StudioExperienceDocument') lines.push(`  private fun decode${name}(j:ViraJson): ${name} { val o=j.obj(); val version=o.req("version").str(); if(version!=${JSON.stringify(C.STUDIO_DOCUMENT_VERSION)}) error("invalid StudioExperienceDocument version: $version"); return ${name}(`);
    else lines.push(`  private fun decode${name}(j:ViraJson): ${name} { val o=j.obj(); return ${name}(`);
    lines.push(m.props.map(p=>{
      const e=(name==='StudioExperienceDocument'&&p.name==='version')?'version':(p.optional?`o[${JSON.stringify(p.name)}]?.let { ${dec(p.type,'it',name,p.name)} }`:dec(p.type,`o.req(${JSON.stringify(p.name)})`,name,p.name));
      return `    ${p.name} = ${e}`;
    }).join(',\n')); lines.push('  ) }');
    lines.push(`  private fun encode${name}(v:${name}): ViraJson.Obj { val m=linkedMapOf<String,ViraJson>()`);
    for(const p of m.props){ if(p.optional) lines.push(`    v.${p.name}?.let { m[${JSON.stringify(p.name)}] = ${enc(p.type,'it')} }`); else lines.push(`    m[${JSON.stringify(p.name)}] = ${enc(p.type,`v.${p.name}`)}`); }
    lines.push('    return ViraJson.Obj(m)\n  }');
  }
  lines.push('}','','private class JsonParser(private val s:String) {','  private var i=0','  fun parse():ViraJson { val v=value(); ws(); if(i!=s.length) error("trailing json"); return v }','  private fun ws(){ while(i<s.length && s[i].isWhitespace()) i++ }','  private fun value():ViraJson { ws(); if(i>=s.length) error("eof"); return when(s[i]) {','    \'{\'->obj(); \'[\'->arr(); \'"\'->ViraJson.Str(str()); \'t\'->{lit("true");ViraJson.Bool(true)}; \'f\'->{lit("false");ViraJson.Bool(false)}; \'n\'->{lit("null");ViraJson.Null}; else->num() } }','  private fun lit(x:String){ if(!s.startsWith(x,i)) error("bad literal"); i+=x.length }','  private fun obj():ViraJson.Obj { i++; ws(); val m=linkedMapOf<String,ViraJson>(); if(i<s.length&&s[i]==\'}\'){i++;return ViraJson.Obj(m)}; while(true){ ws(); val k=str(); ws(); if(i>=s.length||s[i++]!=\':\')error("colon"); if(m.put(k,value())!=null)error("duplicate key"); ws(); if(i<s.length&&s[i]==\'}\'){i++;break}; if(i>=s.length||s[i++]!=\',\')error("comma")}; return ViraJson.Obj(m) }','  private fun arr():ViraJson.Arr { i++; ws(); val a=mutableListOf<ViraJson>(); if(i<s.length&&s[i]==\']\'){i++;return ViraJson.Arr(a)}; while(true){a+=value();ws();if(i<s.length&&s[i]==\']\'){i++;break};if(i>=s.length||s[i++]!=\',\')error("comma")};return ViraJson.Arr(a)}','  private fun str():String { if(i>=s.length||s[i++]!=\'"\')error("quote"); val b=StringBuilder(); while(i<s.length){ val c=s[i++]; if(c==\'"\') return b.toString(); if(c==\'\\\\\'){ if(i>=s.length)error("escape"); when(val e=s[i++]){\'"\'->b.append(\'"\');\'\\\\\'->b.append(\'\\\\\');\'/\'->b.append(\'/\');\'b\'->b.append(\'\\b\');\'f\'->b.append(\'\\u000C\');\'n\'->b.append(\'\\n\');\'r\'->b.append(\'\\r\');\'t\'->b.append(\'\\t\');\'u\'->{ if(i+4>s.length)error("unicode");b.append(s.substring(i,i+4).toInt(16).toChar());i+=4};else->error("escape $e") } } else b.append(c)};error("unterminated") }','  private fun num():ViraJson.Num { val st=i; if(s[i]==\'-\')i++; while(i<s.length&&s[i].isDigit())i++; if(i<s.length&&s[i]==\'.\'){i++;while(i<s.length&&s[i].isDigit())i++}; if(i<s.length&&(s[i]==\'e\'||s[i]==\'E\')){i++;if(i<s.length&&(s[i]==\'+\'||s[i]==\'-\'))i++;while(i<s.length&&s[i].isDigit())i++}; return ViraJson.Num(s.substring(st,i).toDouble()) }','}','','private object JsonWriter {','  fun write(v:ViraJson):String=when(v){','    ViraJson.Null->"null"; is ViraJson.Bool->if(v.value)"true" else "false"; is ViraJson.Num->{ val x=v.value; if(x%1.0==0.0) x.toLong().toString() else x.toString() }; is ViraJson.Str->q(v.value); is ViraJson.Arr->v.value.joinToString(prefix="[",postfix="]",separator=","){write(it)}; is ViraJson.Obj->v.value.entries.joinToString(prefix="{",postfix="}",separator=","){q(it.key)+":"+write(it.value)} }','  private fun q(s:String):String { val b=StringBuilder("\\\""); for(c in s){ when(c){ \'"\'->b.append("\\\\\\\""); \'\\\\\'->b.append("\\\\\\\\"); \'\\b\'->b.append("\\\\b"); \'\\u000C\'->b.append("\\\\f"); \'\\n\'->b.append("\\\\n"); \'\\r\'->b.append("\\\\r"); \'\\t\'->b.append("\\\\t"); else->if(c.code<0x20)b.append("\\\\u%04x".format(c.code)) else b.append(c) } }; return b.append(\'"\').toString() }','}');
  return lines.join('\n');
}

const outputs = new Map([
  [path.join(outRoot,'schema/studio-experience-document.schema.json'), JSON.stringify(schema,null,2)+'\n'],
  [path.join(outRoot,'swift/StudioExperienceModels.swift'), swiftModels()+'\n'],
  [path.join(outRoot,'kotlin/StudioExperienceModels.kt'), kotlinModels()+'\n'],
]);
const digest=crypto.createHash('sha256').update(sourceText).update(semanticText).update(jsonValueText).digest('hex');
outputs.set(path.join(outRoot,'SOURCE_DIGEST'),digest+'\n');
let bad=false;
for(const [p,c] of outputs){ if(check){ if(!fs.existsSync(p)||read(p)!==c){console.error(`generated artifact drift: ${path.relative(root,p)}`);bad=true;} } else { fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,c); console.log(`generated ${path.relative(root,p)}`);} }
if(bad) process.exit(1);
