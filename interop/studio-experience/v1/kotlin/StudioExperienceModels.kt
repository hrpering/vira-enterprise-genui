// GENERATED FILE. DO NOT EDIT.
// Source: packages/studio-schema/src/types.ts

sealed interface ViraJson {
  data object Null: ViraJson
  data class Bool(val value:Boolean): ViraJson
  data class Num(val value:Double): ViraJson
  data class Str(val value:String): ViraJson
  data class Arr(val value:List<ViraJson>): ViraJson
  data class Obj(val value:Map<String,ViraJson>): ViraJson
}

private fun ViraJson.obj(): Map<String,ViraJson> = (this as? ViraJson.Obj)?.value ?: error("expected object")
private fun Map<String,ViraJson>.req(key:String): ViraJson = this[key] ?: error("missing $key")
private fun ViraJson.str(): String = (this as? ViraJson.Str)?.value ?: error("expected string")
private fun ViraJson.num(): Double = (this as? ViraJson.Num)?.value ?: error("expected number")
private fun ViraJson.arr(): List<ViraJson> = (this as? ViraJson.Arr)?.value ?: error("expected array")
private fun strict(value:Map<String,ViraJson>, allowed:Set<String>) { val unknown=value.keys.firstOrNull { it !in allowed }; if (unknown != null) error("unknown field $unknown") }

data class StudioBinding(
  val viewId: String,
  val nodeId: String,
  val prop: String,
  val source: StudioBindingSource
)

data class StudioBindingSource(
  val kind: StudioBindingSourceKind,
  val path: String
)

enum class StudioBindingSourceKind(val wire:String) {
  STATE("state"),
  DOMAIN("domain"),
  SCOPE("scope")
; companion object { fun fromWire(value:String)=entries.firstOrNull { it.wire == value } ?: error("invalid StudioBindingSourceKind") }
}

data class StudioExperienceDocument(
  val version: String,
  val id: String,
  val recipeId: String,
  val entryView: String,
  val views: List<StudioView>,
  val bindings: List<StudioBinding>,
  val interactions: List<StudioInteraction>
)

data class StudioInteraction(
  val viewId: String,
  val nodeId: String,
  val event: String,
  val actionEvent: String,
  val routes: List<StudioInteractionRoute>,
  val payloadBindings: List<StudioInteractionPayloadBinding>? = null
)

enum class StudioInteractionOutcome(val wire:String) {
  SUCCESS("success"),
  EMPTY("empty"),
  ERROR("error")
; companion object { fun fromWire(value:String)=entries.firstOrNull { it.wire == value } ?: error("invalid StudioInteractionOutcome") }
}

data class StudioInteractionPayloadBinding(
  val key: String,
  val source: StudioInteractionPayloadSource
)

sealed interface StudioInteractionPayloadSource {
  data class Variant0(val value:StudioBindingSource): StudioInteractionPayloadSource
  data class Variant1(val value:StudioInteractionPayloadSourceValue1): StudioInteractionPayloadSource
}

data class StudioInteractionPayloadSourceValue1(
  val kind: String,
  val value: ViraJson
)

data class StudioInteractionRoute(
  val outcome: StudioInteractionOutcome,
  val viewId: String
)

data class StudioNode(
  val id: String,
  val component: String,
  val order: Double,
  val props: Map<String, ViraJson>,
  val parentId: String? = null,
  val slot: String? = null,
  val repeat: StudioRepeat? = null
)

data class StudioRepeat(
  val source: StudioRepeatSource
)

data class StudioRepeatSource(
  val kind: StudioRepeatSourceKind,
  val path: String
)

enum class StudioRepeatSourceKind(val wire:String) {
  STATE("state"),
  DOMAIN("domain")
; companion object { fun fromWire(value:String)=entries.firstOrNull { it.wire == value } ?: error("invalid StudioRepeatSourceKind") }
}

data class StudioView(
  val id: String,
  val nodes: List<StudioNode>
)

object ViraStudioCodec {
  fun decodeDocument(text:String): StudioExperienceDocument = decodeStudioExperienceDocument(JsonParser(text).parse())
  fun encodeDocument(value:StudioExperienceDocument): String = JsonWriter.write(encodeStudioExperienceDocument(value))
  private fun decodeStudioInteractionPayloadSource(json:ViraJson): StudioInteractionPayloadSource { val objectValue=json.obj(); val kind=objectValue.req("kind").str()
    if (kind == "state" || kind == "domain" || kind == "scope") return StudioInteractionPayloadSource.Variant0(decodeStudioBindingSource(json))
    if (kind == "literal") return StudioInteractionPayloadSource.Variant1(decodeStudioInteractionPayloadSourceValue1(json))
    error("unsupported StudioInteractionPayloadSource discriminator: $kind")
  }
  private fun encodeStudioInteractionPayloadSource(value:StudioInteractionPayloadSource): ViraJson = when(value) {
    is StudioInteractionPayloadSource.Variant0 -> encodeStudioBindingSource(value.value)
    is StudioInteractionPayloadSource.Variant1 -> encodeStudioInteractionPayloadSourceValue1(value.value)
  }
  private fun decodeStudioBinding(json:ViraJson): StudioBinding { val objectValue=json.obj(); strict(objectValue, setOf("viewId", "nodeId", "prop", "source")); return StudioBinding(
    viewId = objectValue.req("viewId").str(),
    nodeId = objectValue.req("nodeId").str(),
    prop = objectValue.req("prop").str(),
    source = decodeStudioBindingSource(objectValue.req("source"))
  ) }
  private fun encodeStudioBinding(value:StudioBinding): ViraJson.Obj { val result=linkedMapOf<String,ViraJson>()
    result["viewId"] = ViraJson.Str(value.viewId)
    result["nodeId"] = ViraJson.Str(value.nodeId)
    result["prop"] = ViraJson.Str(value.prop)
    result["source"] = encodeStudioBindingSource(value.source)
    return ViraJson.Obj(result)
  }
  private fun decodeStudioBindingSource(json:ViraJson): StudioBindingSource { val objectValue=json.obj(); strict(objectValue, setOf("kind", "path")); return StudioBindingSource(
    kind = StudioBindingSourceKind.fromWire(objectValue.req("kind").str()),
    path = objectValue.req("path").str()
  ) }
  private fun encodeStudioBindingSource(value:StudioBindingSource): ViraJson.Obj { val result=linkedMapOf<String,ViraJson>()
    result["kind"] = ViraJson.Str(value.kind.wire)
    result["path"] = ViraJson.Str(value.path)
    return ViraJson.Obj(result)
  }
  private fun decodeStudioExperienceDocument(json:ViraJson): StudioExperienceDocument { val objectValue=json.obj(); strict(objectValue, setOf("version", "id", "recipeId", "entryView", "views", "bindings", "interactions")); return StudioExperienceDocument(
    version = objectValue.req("version").str().also { if (it != "1") error("expected literal 1") },
    id = objectValue.req("id").str(),
    recipeId = objectValue.req("recipeId").str(),
    entryView = objectValue.req("entryView").str(),
    views = objectValue.req("views").arr().map { decodeStudioView(it) },
    bindings = objectValue.req("bindings").arr().map { decodeStudioBinding(it) },
    interactions = objectValue.req("interactions").arr().map { decodeStudioInteraction(it) }
  ) }
  private fun encodeStudioExperienceDocument(value:StudioExperienceDocument): ViraJson.Obj { val result=linkedMapOf<String,ViraJson>()
    result["version"] = ViraJson.Str(value.version)
    result["id"] = ViraJson.Str(value.id)
    result["recipeId"] = ViraJson.Str(value.recipeId)
    result["entryView"] = ViraJson.Str(value.entryView)
    result["views"] = ViraJson.Arr(value.views.map { encodeStudioView(it) })
    result["bindings"] = ViraJson.Arr(value.bindings.map { encodeStudioBinding(it) })
    result["interactions"] = ViraJson.Arr(value.interactions.map { encodeStudioInteraction(it) })
    return ViraJson.Obj(result)
  }
  private fun decodeStudioInteraction(json:ViraJson): StudioInteraction { val objectValue=json.obj(); strict(objectValue, setOf("viewId", "nodeId", "event", "actionEvent", "routes", "payloadBindings")); return StudioInteraction(
    viewId = objectValue.req("viewId").str(),
    nodeId = objectValue.req("nodeId").str(),
    event = objectValue.req("event").str(),
    actionEvent = objectValue.req("actionEvent").str(),
    routes = objectValue.req("routes").arr().map { decodeStudioInteractionRoute(it) },
    payloadBindings = objectValue["payloadBindings"]?.let { it.arr().map { decodeStudioInteractionPayloadBinding(it) } }
  ) }
  private fun encodeStudioInteraction(value:StudioInteraction): ViraJson.Obj { val result=linkedMapOf<String,ViraJson>()
    result["viewId"] = ViraJson.Str(value.viewId)
    result["nodeId"] = ViraJson.Str(value.nodeId)
    result["event"] = ViraJson.Str(value.event)
    result["actionEvent"] = ViraJson.Str(value.actionEvent)
    result["routes"] = ViraJson.Arr(value.routes.map { encodeStudioInteractionRoute(it) })
    value.payloadBindings?.let { result["payloadBindings"] = ViraJson.Arr(it.map { encodeStudioInteractionPayloadBinding(it) }) }
    return ViraJson.Obj(result)
  }
  private fun decodeStudioInteractionPayloadBinding(json:ViraJson): StudioInteractionPayloadBinding { val objectValue=json.obj(); strict(objectValue, setOf("key", "source")); return StudioInteractionPayloadBinding(
    key = objectValue.req("key").str(),
    source = decodeStudioInteractionPayloadSource(objectValue.req("source"))
  ) }
  private fun encodeStudioInteractionPayloadBinding(value:StudioInteractionPayloadBinding): ViraJson.Obj { val result=linkedMapOf<String,ViraJson>()
    result["key"] = ViraJson.Str(value.key)
    result["source"] = encodeStudioInteractionPayloadSource(value.source)
    return ViraJson.Obj(result)
  }
  private fun decodeStudioInteractionPayloadSourceValue1(json:ViraJson): StudioInteractionPayloadSourceValue1 { val objectValue=json.obj(); strict(objectValue, setOf("kind", "value")); return StudioInteractionPayloadSourceValue1(
    kind = objectValue.req("kind").str().also { if (it != "literal") error("expected literal literal") },
    value = objectValue.req("value")
  ) }
  private fun encodeStudioInteractionPayloadSourceValue1(value:StudioInteractionPayloadSourceValue1): ViraJson.Obj { val result=linkedMapOf<String,ViraJson>()
    result["kind"] = ViraJson.Str(value.kind)
    result["value"] = value.value
    return ViraJson.Obj(result)
  }
  private fun decodeStudioInteractionRoute(json:ViraJson): StudioInteractionRoute { val objectValue=json.obj(); strict(objectValue, setOf("outcome", "viewId")); return StudioInteractionRoute(
    outcome = StudioInteractionOutcome.fromWire(objectValue.req("outcome").str()),
    viewId = objectValue.req("viewId").str()
  ) }
  private fun encodeStudioInteractionRoute(value:StudioInteractionRoute): ViraJson.Obj { val result=linkedMapOf<String,ViraJson>()
    result["outcome"] = ViraJson.Str(value.outcome.wire)
    result["viewId"] = ViraJson.Str(value.viewId)
    return ViraJson.Obj(result)
  }
  private fun decodeStudioNode(json:ViraJson): StudioNode { val objectValue=json.obj(); strict(objectValue, setOf("id", "component", "order", "props", "parentId", "slot", "repeat")); return StudioNode(
    id = objectValue.req("id").str(),
    component = objectValue.req("component").str(),
    order = objectValue.req("order").num(),
    props = objectValue.req("props").obj(),
    parentId = objectValue["parentId"]?.let { it.str() },
    slot = objectValue["slot"]?.let { it.str() },
    repeat = objectValue["repeat"]?.let { decodeStudioRepeat(it) }
  ) }
  private fun encodeStudioNode(value:StudioNode): ViraJson.Obj { val result=linkedMapOf<String,ViraJson>()
    result["id"] = ViraJson.Str(value.id)
    result["component"] = ViraJson.Str(value.component)
    result["order"] = ViraJson.Num(value.order)
    result["props"] = ViraJson.Obj(value.props)
    value.parentId?.let { result["parentId"] = ViraJson.Str(it) }
    value.slot?.let { result["slot"] = ViraJson.Str(it) }
    value.repeat?.let { result["repeat"] = encodeStudioRepeat(it) }
    return ViraJson.Obj(result)
  }
  private fun decodeStudioRepeat(json:ViraJson): StudioRepeat { val objectValue=json.obj(); strict(objectValue, setOf("source")); return StudioRepeat(
    source = decodeStudioRepeatSource(objectValue.req("source"))
  ) }
  private fun encodeStudioRepeat(value:StudioRepeat): ViraJson.Obj { val result=linkedMapOf<String,ViraJson>()
    result["source"] = encodeStudioRepeatSource(value.source)
    return ViraJson.Obj(result)
  }
  private fun decodeStudioRepeatSource(json:ViraJson): StudioRepeatSource { val objectValue=json.obj(); strict(objectValue, setOf("kind", "path")); return StudioRepeatSource(
    kind = StudioRepeatSourceKind.fromWire(objectValue.req("kind").str()),
    path = objectValue.req("path").str()
  ) }
  private fun encodeStudioRepeatSource(value:StudioRepeatSource): ViraJson.Obj { val result=linkedMapOf<String,ViraJson>()
    result["kind"] = ViraJson.Str(value.kind.wire)
    result["path"] = ViraJson.Str(value.path)
    return ViraJson.Obj(result)
  }
  private fun decodeStudioView(json:ViraJson): StudioView { val objectValue=json.obj(); strict(objectValue, setOf("id", "nodes")); return StudioView(
    id = objectValue.req("id").str(),
    nodes = objectValue.req("nodes").arr().map { decodeStudioNode(it) }
  ) }
  private fun encodeStudioView(value:StudioView): ViraJson.Obj { val result=linkedMapOf<String,ViraJson>()
    result["id"] = ViraJson.Str(value.id)
    result["nodes"] = ViraJson.Arr(value.nodes.map { encodeStudioNode(it) })
    return ViraJson.Obj(result)
  }
}

private class JsonParser(private val source:String) {
  private var index=0
  fun parse():ViraJson { val value=parseValue(); whitespace(); if(index!=source.length) error("trailing json"); return value }
  private fun whitespace(){ while(index<source.length && source[index].isWhitespace()) index++ }
  private fun parseValue():ViraJson { whitespace(); if(index>=source.length) error("eof"); return when(source[index]) {
    '{'->parseObject(); '['->parseArray(); '"'->ViraJson.Str(parseString()); 't'->{literal("true");ViraJson.Bool(true)}; 'f'->{literal("false");ViraJson.Bool(false)}; 'n'->{literal("null");ViraJson.Null}; else->parseNumber() } }
  private fun literal(value:String){ if(!source.startsWith(value,index)) error("bad literal"); index+=value.length }
  private fun parseObject():ViraJson.Obj { index++; whitespace(); val result=linkedMapOf<String,ViraJson>(); if(index<source.length&&source[index]=='}'){index++;return ViraJson.Obj(result)}; while(true){ whitespace(); val key=parseString(); whitespace(); if(index>=source.length||source[index++]!=':')error("colon"); if(result.put(key,parseValue())!=null)error("duplicate key"); whitespace(); if(index<source.length&&source[index]=='}'){index++;break}; if(index>=source.length||source[index++]!=',')error("comma")}; return ViraJson.Obj(result) }
  private fun parseArray():ViraJson.Arr { index++; whitespace(); val result=mutableListOf<ViraJson>(); if(index<source.length&&source[index]==']'){index++;return ViraJson.Arr(result)}; while(true){result+=parseValue();whitespace();if(index<source.length&&source[index]==']'){index++;break};if(index>=source.length||source[index++]!=',')error("comma")};return ViraJson.Arr(result)}
  private fun parseString():String { if(index>=source.length||source[index++]!='"')error("quote"); val result=StringBuilder(); while(index<source.length){ val character=source[index++]; if(character=='"') return result.toString(); if(character.code<0x20) error("raw control character"); if(character=='\\'){ if(index>=source.length)error("escape"); when(val escaped=source[index++]){'"'->result.append('"');'\\'->result.append('\\');'/'->result.append('/');'b'->result.append('\b');'f'->result.append('\u000C');'n'->result.append('\n');'r'->result.append('\r');'t'->result.append('\t');'u'->{ if(index+4>source.length)error("unicode");result.append(source.substring(index,index+4).toInt(16).toChar());index+=4};else->error("escape $escaped") } } else result.append(character)};error("unterminated") }
  private fun parseNumber():ViraJson.Num { val start=index; if(source[index]=='-')index++; if(index>=source.length)error("number"); if(source[index]=='0'){index++; if(index<source.length&&source[index].isDigit())error("leading zero")} else { if(!source[index].isDigit())error("number"); while(index<source.length&&source[index].isDigit())index++ }; if(index<source.length&&source[index]=='.'){index++; val fractionStart=index; while(index<source.length&&source[index].isDigit())index++; if(index==fractionStart)error("fraction")}; if(index<source.length&&(source[index]=='e'||source[index]=='E')){index++;if(index<source.length&&(source[index]=='+'||source[index]=='-'))index++;val exponentStart=index;while(index<source.length&&source[index].isDigit())index++;if(index==exponentStart)error("exponent")}; val number=source.substring(start,index).toDouble(); if(!number.isFinite() || number.toRawBits() == (-0.0).toRawBits()) error("non-canonical number"); return ViraJson.Num(number) }
}

private object JsonWriter {
  fun write(value:ViraJson):String=when(value){
    ViraJson.Null->"null"; is ViraJson.Bool->if(value.value)"true" else "false"; is ViraJson.Num->{ val number=value.value; if(!number.isFinite() || number.toRawBits() == (-0.0).toRawBits()) error("non-canonical number"); number.toString() }; is ViraJson.Str->quote(value.value); is ViraJson.Arr->value.value.joinToString(prefix="[",postfix="]",separator=","){write(it)}; is ViraJson.Obj->value.value.entries.joinToString(prefix="{",postfix="}",separator=","){quote(it.key)+":"+write(it.value)} }
  private fun quote(value:String):String { val result=StringBuilder("\""); for(character in value){ when(character){ '"'->result.append("\\\""); '\\'->result.append("\\\\"); '\b'->result.append("\\b"); '\u000C'->result.append("\\f"); '\n'->result.append("\\n"); '\r'->result.append("\\r"); '\t'->result.append("\\t"); else->if(character.code<0x20)result.append("\\u%04x".format(character.code)) else result.append(character) } }; return result.append('"').toString() }
}
