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
private fun Map<String,ViraJson>.req(k:String): ViraJson = this[k] ?: error("missing $k")
private fun ViraJson.str(): String = (this as? ViraJson.Str)?.value ?: error("expected string")
private fun ViraJson.num(): Double = (this as? ViraJson.Num)?.value ?: error("expected number")
private fun ViraJson.arr(): List<ViraJson> = (this as? ViraJson.Arr)?.value ?: error("expected array")

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
; companion object { fun fromWire(v:String)=entries.firstOrNull{it.wire==v}?:error("invalid StudioBindingSourceKind") }
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
; companion object { fun fromWire(v:String)=entries.firstOrNull{it.wire==v}?:error("invalid StudioInteractionOutcome") }
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
  val kind: String,
  val path: String
)

data class StudioView(
  val id: String,
  val nodes: List<StudioNode>
)

object ViraStudioCodec {
  fun decodeDocument(text:String): StudioExperienceDocument { val j=JsonParser(text).parse(); return decodeStudioExperienceDocument(j) }
  fun encodeDocument(v:StudioExperienceDocument): String = JsonWriter.write(encodeStudioExperienceDocument(v))

  private fun decodeStudioInteractionPayloadSource(j:ViraJson): StudioInteractionPayloadSource { val o=j.obj(); val kind=o.req("kind").str();
    if (kind=="state" || kind=="domain" || kind=="scope") return StudioInteractionPayloadSource.Variant0(decodeStudioBindingSource(j))
    if (kind=="literal") return StudioInteractionPayloadSource.Variant1(decodeStudioInteractionPayloadSourceValue1(j))
    error("unsupported StudioInteractionPayloadSource discriminator: $kind")
  }
  private fun encodeStudioInteractionPayloadSource(v:StudioInteractionPayloadSource): ViraJson = when(v) {
    is StudioInteractionPayloadSource.Variant0 -> encodeStudioBindingSource(v.value)
    is StudioInteractionPayloadSource.Variant1 -> encodeStudioInteractionPayloadSourceValue1(v.value)
  }
  private fun decodeStudioBinding(j:ViraJson): StudioBinding { val o=j.obj(); return StudioBinding(
    viewId = o.req("viewId").str(),
    nodeId = o.req("nodeId").str(),
    prop = o.req("prop").str(),
    source = decodeStudioBindingSource(o.req("source"))
  ) }
  private fun encodeStudioBinding(v:StudioBinding): ViraJson.Obj { val m=linkedMapOf<String,ViraJson>()
    m["viewId"] = ViraJson.Str(v.viewId)
    m["nodeId"] = ViraJson.Str(v.nodeId)
    m["prop"] = ViraJson.Str(v.prop)
    m["source"] = encodeStudioBindingSource(v.source)
    return ViraJson.Obj(m)
  }
  private fun decodeStudioBindingSource(j:ViraJson): StudioBindingSource { val o=j.obj(); return StudioBindingSource(
    kind = StudioBindingSourceKind.fromWire(o.req("kind").str()),
    path = o.req("path").str()
  ) }
  private fun encodeStudioBindingSource(v:StudioBindingSource): ViraJson.Obj { val m=linkedMapOf<String,ViraJson>()
    m["kind"] = ViraJson.Str(v.kind.wire)
    m["path"] = ViraJson.Str(v.path)
    return ViraJson.Obj(m)
  }
  private fun decodeStudioExperienceDocument(j:ViraJson): StudioExperienceDocument { val o=j.obj(); val version=o.req("version").str(); if(version!="1") error("invalid StudioExperienceDocument version: $version"); return StudioExperienceDocument(
    version = version,
    id = o.req("id").str(),
    recipeId = o.req("recipeId").str(),
    entryView = o.req("entryView").str(),
    views = o.req("views").arr().map { decodeStudioView(it) },
    bindings = o.req("bindings").arr().map { decodeStudioBinding(it) },
    interactions = o.req("interactions").arr().map { decodeStudioInteraction(it) }
  ) }
  private fun encodeStudioExperienceDocument(v:StudioExperienceDocument): ViraJson.Obj { val m=linkedMapOf<String,ViraJson>()
    m["version"] = ViraJson.Str(v.version)
    m["id"] = ViraJson.Str(v.id)
    m["recipeId"] = ViraJson.Str(v.recipeId)
    m["entryView"] = ViraJson.Str(v.entryView)
    m["views"] = ViraJson.Arr(v.views.map { encodeStudioView(it) })
    m["bindings"] = ViraJson.Arr(v.bindings.map { encodeStudioBinding(it) })
    m["interactions"] = ViraJson.Arr(v.interactions.map { encodeStudioInteraction(it) })
    return ViraJson.Obj(m)
  }
  private fun decodeStudioInteraction(j:ViraJson): StudioInteraction { val o=j.obj(); return StudioInteraction(
    viewId = o.req("viewId").str(),
    nodeId = o.req("nodeId").str(),
    event = o.req("event").str(),
    actionEvent = o.req("actionEvent").str(),
    routes = o.req("routes").arr().map { decodeStudioInteractionRoute(it) },
    payloadBindings = o["payloadBindings"]?.let { it.arr().map { decodeStudioInteractionPayloadBinding(it) } }
  ) }
  private fun encodeStudioInteraction(v:StudioInteraction): ViraJson.Obj { val m=linkedMapOf<String,ViraJson>()
    m["viewId"] = ViraJson.Str(v.viewId)
    m["nodeId"] = ViraJson.Str(v.nodeId)
    m["event"] = ViraJson.Str(v.event)
    m["actionEvent"] = ViraJson.Str(v.actionEvent)
    m["routes"] = ViraJson.Arr(v.routes.map { encodeStudioInteractionRoute(it) })
    v.payloadBindings?.let { m["payloadBindings"] = ViraJson.Arr(it.map { encodeStudioInteractionPayloadBinding(it) }) }
    return ViraJson.Obj(m)
  }
  private fun decodeStudioInteractionPayloadBinding(j:ViraJson): StudioInteractionPayloadBinding { val o=j.obj(); return StudioInteractionPayloadBinding(
    key = o.req("key").str(),
    source = decodeStudioInteractionPayloadSource(o.req("source"))
  ) }
  private fun encodeStudioInteractionPayloadBinding(v:StudioInteractionPayloadBinding): ViraJson.Obj { val m=linkedMapOf<String,ViraJson>()
    m["key"] = ViraJson.Str(v.key)
    m["source"] = encodeStudioInteractionPayloadSource(v.source)
    return ViraJson.Obj(m)
  }
  private fun decodeStudioInteractionPayloadSourceValue1(j:ViraJson): StudioInteractionPayloadSourceValue1 { val o=j.obj(); return StudioInteractionPayloadSourceValue1(
    kind = o.req("kind").str(),
    value = o.req("value")
  ) }
  private fun encodeStudioInteractionPayloadSourceValue1(v:StudioInteractionPayloadSourceValue1): ViraJson.Obj { val m=linkedMapOf<String,ViraJson>()
    m["kind"] = ViraJson.Str(v.kind)
    m["value"] = v.value
    return ViraJson.Obj(m)
  }
  private fun decodeStudioInteractionRoute(j:ViraJson): StudioInteractionRoute { val o=j.obj(); return StudioInteractionRoute(
    outcome = StudioInteractionOutcome.fromWire(o.req("outcome").str()),
    viewId = o.req("viewId").str()
  ) }
  private fun encodeStudioInteractionRoute(v:StudioInteractionRoute): ViraJson.Obj { val m=linkedMapOf<String,ViraJson>()
    m["outcome"] = ViraJson.Str(v.outcome.wire)
    m["viewId"] = ViraJson.Str(v.viewId)
    return ViraJson.Obj(m)
  }
  private fun decodeStudioNode(j:ViraJson): StudioNode { val o=j.obj(); return StudioNode(
    id = o.req("id").str(),
    component = o.req("component").str(),
    order = o.req("order").num(),
    props = o.req("props").obj(),
    parentId = o["parentId"]?.let { it.str() },
    slot = o["slot"]?.let { it.str() },
    repeat = o["repeat"]?.let { decodeStudioRepeat(it) }
  ) }
  private fun encodeStudioNode(v:StudioNode): ViraJson.Obj { val m=linkedMapOf<String,ViraJson>()
    m["id"] = ViraJson.Str(v.id)
    m["component"] = ViraJson.Str(v.component)
    m["order"] = ViraJson.Num(v.order)
    m["props"] = ViraJson.Obj(v.props)
    v.parentId?.let { m["parentId"] = ViraJson.Str(it) }
    v.slot?.let { m["slot"] = ViraJson.Str(it) }
    v.repeat?.let { m["repeat"] = encodeStudioRepeat(it) }
    return ViraJson.Obj(m)
  }
  private fun decodeStudioRepeat(j:ViraJson): StudioRepeat { val o=j.obj(); return StudioRepeat(
    source = decodeStudioRepeatSource(o.req("source"))
  ) }
  private fun encodeStudioRepeat(v:StudioRepeat): ViraJson.Obj { val m=linkedMapOf<String,ViraJson>()
    m["source"] = encodeStudioRepeatSource(v.source)
    return ViraJson.Obj(m)
  }
  private fun decodeStudioRepeatSource(j:ViraJson): StudioRepeatSource { val o=j.obj(); return StudioRepeatSource(
    kind = o.req("kind").str(),
    path = o.req("path").str()
  ) }
  private fun encodeStudioRepeatSource(v:StudioRepeatSource): ViraJson.Obj { val m=linkedMapOf<String,ViraJson>()
    m["kind"] = ViraJson.Str(v.kind)
    m["path"] = ViraJson.Str(v.path)
    return ViraJson.Obj(m)
  }
  private fun decodeStudioView(j:ViraJson): StudioView { val o=j.obj(); return StudioView(
    id = o.req("id").str(),
    nodes = o.req("nodes").arr().map { decodeStudioNode(it) }
  ) }
  private fun encodeStudioView(v:StudioView): ViraJson.Obj { val m=linkedMapOf<String,ViraJson>()
    m["id"] = ViraJson.Str(v.id)
    m["nodes"] = ViraJson.Arr(v.nodes.map { encodeStudioNode(it) })
    return ViraJson.Obj(m)
  }
}

private class JsonParser(private val s:String) {
  private var i=0
  fun parse():ViraJson { val v=value(); ws(); if(i!=s.length) error("trailing json"); return v }
  private fun ws(){ while(i<s.length && s[i].isWhitespace()) i++ }
  private fun value():ViraJson { ws(); if(i>=s.length) error("eof"); return when(s[i]) {
    '{'->obj(); '['->arr(); '"'->ViraJson.Str(str()); 't'->{lit("true");ViraJson.Bool(true)}; 'f'->{lit("false");ViraJson.Bool(false)}; 'n'->{lit("null");ViraJson.Null}; else->num() } }
  private fun lit(x:String){ if(!s.startsWith(x,i)) error("bad literal"); i+=x.length }
  private fun obj():ViraJson.Obj { i++; ws(); val m=linkedMapOf<String,ViraJson>(); if(i<s.length&&s[i]=='}'){i++;return ViraJson.Obj(m)}; while(true){ ws(); val k=str(); ws(); if(i>=s.length||s[i++]!=':')error("colon"); if(m.put(k,value())!=null)error("duplicate key"); ws(); if(i<s.length&&s[i]=='}'){i++;break}; if(i>=s.length||s[i++]!=',')error("comma")}; return ViraJson.Obj(m) }
  private fun arr():ViraJson.Arr { i++; ws(); val a=mutableListOf<ViraJson>(); if(i<s.length&&s[i]==']'){i++;return ViraJson.Arr(a)}; while(true){a+=value();ws();if(i<s.length&&s[i]==']'){i++;break};if(i>=s.length||s[i++]!=',')error("comma")};return ViraJson.Arr(a)}
  private fun str():String { if(i>=s.length||s[i++]!='"')error("quote"); val b=StringBuilder(); while(i<s.length){ val c=s[i++]; if(c=='"') return b.toString(); if(c=='\\'){ if(i>=s.length)error("escape"); when(val e=s[i++]){'"'->b.append('"');'\\'->b.append('\\');'/'->b.append('/');'b'->b.append('\b');'f'->b.append('\u000C');'n'->b.append('\n');'r'->b.append('\r');'t'->b.append('\t');'u'->{ if(i+4>s.length)error("unicode");b.append(s.substring(i,i+4).toInt(16).toChar());i+=4};else->error("escape $e") } } else b.append(c)};error("unterminated") }
  private fun num():ViraJson.Num { val st=i; if(s[i]=='-')i++; while(i<s.length&&s[i].isDigit())i++; if(i<s.length&&s[i]=='.'){i++;while(i<s.length&&s[i].isDigit())i++}; if(i<s.length&&(s[i]=='e'||s[i]=='E')){i++;if(i<s.length&&(s[i]=='+'||s[i]=='-'))i++;while(i<s.length&&s[i].isDigit())i++}; return ViraJson.Num(s.substring(st,i).toDouble()) }
}

private object JsonWriter {
  fun write(v:ViraJson):String=when(v){
    ViraJson.Null->"null"; is ViraJson.Bool->if(v.value)"true" else "false"; is ViraJson.Num->{ val x=v.value; if(x%1.0==0.0) x.toLong().toString() else x.toString() }; is ViraJson.Str->q(v.value); is ViraJson.Arr->v.value.joinToString(prefix="[",postfix="]",separator=","){write(it)}; is ViraJson.Obj->v.value.entries.joinToString(prefix="{",postfix="}",separator=","){q(it.key)+":"+write(it.value)} }
  private fun q(s:String):String { val b=StringBuilder("\""); for(c in s){ when(c){ '"'->b.append("\\\""); '\\'->b.append("\\\\"); '\b'->b.append("\\b"); '\u000C'->b.append("\\f"); '\n'->b.append("\\n"); '\r'->b.append("\\r"); '\t'->b.append("\\t"); else->if(c.code<0x20)b.append("\\u%04x".format(c.code)) else b.append(c) } }; return b.append('"').toString() }
}
