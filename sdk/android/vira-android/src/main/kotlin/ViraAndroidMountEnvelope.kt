data class ViraAndroidPackIdentity(
  val id: String,
  val version: String,
  val entrypoint: String,
)

data class ViraAndroidArtifactIdentity(
  val id: String,
  val role: String,
  val mediaType: String,
  val digest: String,
)

data class ViraAndroidCompatibilityIdentity(
  val hostId: String,
  val platform: String,
)

data class ViraAndroidCapability(
  val version: String,
  val id: String,
)

data class ViraAndroidHostManifest(
  val version: String,
  val id: String,
  val platform: String,
  val implementationIds: List<String>,
  val capabilities: List<ViraAndroidCapability>,
)

enum class ViraAndroidCatalogValueType(val wire: String) {
  STRING("string"), NUMBER("number"), BOOLEAN("boolean"), ENUM("enum");
  companion object { fun fromWire(value: String) = entries.firstOrNull { it.wire == value } }
}

enum class ViraAndroidBindingValueType(val wire: String) {
  STRING("string"), NUMBER("number"), BOOLEAN("boolean"), ENUM("enum"), ARRAY("array"), OBJECT("object");
  companion object { fun fromWire(value: String) = entries.firstOrNull { it.wire == value } }
}

enum class ViraAndroidBindingSourceKind(val wire: String) {
  STATE("state"), DOMAIN("domain"), SCOPE("scope");
  companion object { fun fromWire(value: String) = entries.firstOrNull { it.wire == value } }
}

data class ViraAndroidBindingSourceDefinition(
  val kind: ViraAndroidBindingSourceKind,
  val path: String,
  val valueType: ViraAndroidBindingValueType,
)

data class ViraAndroidPropDefinition(
  val key: String,
  val type: ViraAndroidCatalogValueType,
  val required: Boolean,
  val bindable: Boolean,
  val options: List<String>?,
)

data class ViraAndroidEventPayloadDefinition(
  val key: String,
  val type: ViraAndroidCatalogValueType,
  val required: Boolean,
  val options: List<String>?,
)

data class ViraAndroidEventDefinition(
  val name: String,
  val payload: List<ViraAndroidEventPayloadDefinition>?,
)

data class ViraAndroidComponentDefinition(
  val ref: String,
  val implementationId: String,
  val props: List<ViraAndroidPropDefinition>,
  val slots: List<String>,
  val events: List<ViraAndroidEventDefinition>,
)

data class ViraAndroidActionMapping(
  val event: String,
  val actionType: String,
)

data class ViraAndroidBrandProjection(
  val version: String,
  val id: String,
  val components: List<ViraAndroidComponentDefinition>,
  val actions: List<ViraAndroidActionMapping>,
  val dataSources: List<ViraAndroidBindingSourceDefinition>,
)

data class ViraAndroidMountEnvelope(
  val version: String,
  val instanceId: String,
  val deploymentId: String,
  val pack: ViraAndroidPackIdentity,
  val artifact: ViraAndroidArtifactIdentity,
  val compatibility: ViraAndroidCompatibilityIdentity,
  val host: ViraAndroidHostManifest,
  val brand: ViraAndroidBrandProjection,
  val document: StudioExperienceDocument,
) {
  companion object {
    fun decode(text: String): Result<ViraAndroidMountEnvelope> = runCatching {
      val root = ViraAndroidCanonicalJson.decode(text).objectExact(
        "version", "instanceId", "deploymentId", "pack", "artifact",
        "compatibility", "host", "brand", "document",
      )
      val version = root.string("version")
      val instanceId = root.string("instanceId")
      val deploymentId = root.string("deploymentId")
      if (version != VIRA_ANDROID_MOUNT_ENVELOPE_VERSION || instanceId.isBlank() || deploymentId.isBlank()) invalid()
      if (instanceId.length > 4_096 || deploymentId.length > 4_096) invalid()

      val packObject = root.required("pack").objectExact("id", "version", "entrypoint")
      val pack = ViraAndroidPackIdentity(
        packObject.string("id"),
        packObject.string("version"),
        packObject.string("entrypoint"),
      )
      if (pack.id.isBlank() || pack.version.isBlank() || pack.entrypoint.isBlank()) invalid()

      val artifactObject = root.required("artifact").objectExact("id", "role", "mediaType", "digest")
      val artifact = ViraAndroidArtifactIdentity(
        artifactObject.string("id"),
        artifactObject.string("role"),
        artifactObject.string("mediaType"),
        artifactObject.string("digest"),
      )
      if (artifact.id.isBlank() || artifact.digest.isBlank() || artifact.role != "studio-publication" || artifact.mediaType != "application/json") invalid()

      val compatibilityObject = root.required("compatibility").objectExact("hostId", "platform")
      val compatibility = ViraAndroidCompatibilityIdentity(
        compatibilityObject.string("hostId"),
        compatibilityObject.string("platform"),
      )
      if (!ViraAndroidSemanticIdentifier.isNamespace(compatibility.hostId, requiresDot = true) || compatibility.platform != VIRA_ANDROID_PLATFORM) invalid()

      val host = decodeHost(root.required("host"))
      if (host.id != compatibility.hostId || host.platform != VIRA_ANDROID_PLATFORM) invalid()

      val brand = decodeBrand(root.required("brand"))
      val documentJson = root.required("document")
      val document = ViraStudioCodec.decodeDocument(ViraAndroidCanonicalJson.encode(documentJson))

      if (!validateViraAndroidDocumentGraphSafety(document)) invalid()
      if (!validateViraAndroidDocumentProjectionIntegrity(document, brand)) invalid()

      val supported = host.implementationIds.toSet()
      if (!brand.components.all { it.implementationId in supported }) invalid()
      val componentRefs = brand.components.map { it.ref }.toSet()
      if (!document.views.flatMap { it.nodes }.all { it.component in componentRefs }) invalid()
      val actionEvents = brand.actions.map { it.event }.toSet()
      if (!document.interactions.all { it.actionEvent in actionEvents }) invalid()

      ViraAndroidMountEnvelope(
        version,
        instanceId,
        deploymentId,
        pack,
        artifact,
        compatibility,
        host,
        brand,
        document,
      )
    }.recoverCatching { error ->
      if (error is ViraAndroidIssue) throw error
      throw ViraAndroidIssue(
        ViraAndroidIssueCode.INVALID_ENVELOPE,
        "$",
        "native Android mount envelope is invalid",
      )
    }

    private fun decodeHost(raw: ViraJson): ViraAndroidHostManifest {
      val objectValue = raw.objectExact("version", "id", "platform", "implementationIds", "capabilities")
      val version = objectValue.string("version")
      val id = objectValue.string("id")
      val platform = objectValue.string("platform")
      val implementationIds = objectValue.required("implementationIds").asArrayOrNull()?.map { it.asStringOrNull() ?: invalid() } ?: invalid()
      val capabilities = objectValue.required("capabilities").asArrayOrNull()?.map { capability ->
        val item = capability.objectExact("version", "id")
        ViraAndroidCapability(item.string("version"), item.string("id"))
      } ?: invalid()
      if (version != "1" || platform != VIRA_ANDROID_PLATFORM || !ViraAndroidSemanticIdentifier.isNamespace(id, requiresDot = true)) invalid()
      if (implementationIds.size > 512 || implementationIds.toSet().size != implementationIds.size) invalid()
      if (!implementationIds.all { ViraAndroidSemanticIdentifier.isNamespace(it, requiresDot = true) }) invalid()
      if (capabilities.size > 256 || capabilities.toSet().size != capabilities.size) invalid()
      if (!capabilities.all { it.version.isNotBlank() && ViraAndroidSemanticIdentifier.isNamespace(it.id) }) invalid()
      return ViraAndroidHostManifest(version, id, platform, implementationIds, capabilities)
    }

    private fun decodeBrand(raw: ViraJson): ViraAndroidBrandProjection {
      val objectValue = raw.objectExact("version", "id", "components", "actions", "dataSources")
      val version = objectValue.string("version")
      val id = objectValue.string("id")
      if (version != "1" || !ViraAndroidSemanticIdentifier.isNamespace(id)) invalid()

      val components = objectValue.required("components").asArrayOrNull()?.map(::decodeComponent) ?: invalid()
      val actions = objectValue.required("actions").asArrayOrNull()?.map { action ->
        val item = action.objectExact("event", "actionType")
        ViraAndroidActionMapping(item.string("event"), item.string("actionType"))
      } ?: invalid()
      val dataSources = objectValue.required("dataSources").asArrayOrNull()?.map { source ->
        val item = source.objectExact("kind", "path", "valueType")
        val kind = ViraAndroidBindingSourceKind.fromWire(item.string("kind")) ?: invalid()
        val path = item.string("path")
        val valueType = ViraAndroidBindingValueType.fromWire(item.string("valueType")) ?: invalid()
        val pathValid = if (kind == ViraAndroidBindingSourceKind.SCOPE) {
          ViraAndroidSemanticIdentifier.isScopePath(path)
        } else {
          ViraAndroidSemanticIdentifier.isNamespace(path)
        }
        if (!pathValid) invalid()
        ViraAndroidBindingSourceDefinition(kind, path, valueType)
      } ?: invalid()

      if (components.size > 512 || components.map { it.ref }.toSet().size != components.size) invalid()
      if (actions.size > 512 || actions.map { it.event }.toSet().size != actions.size) invalid()
      if (!actions.all { it.event.isNotBlank() && ViraAndroidSemanticIdentifier.isNamespace(it.actionType) }) invalid()
      if (dataSources.size > 512 || dataSources.map { it.kind to it.path }.toSet().size != dataSources.size) invalid()
      return ViraAndroidBrandProjection(version, id, components, actions, dataSources)
    }

    private fun decodeComponent(raw: ViraJson): ViraAndroidComponentDefinition {
      val objectValue = raw.objectExact("ref", "implementationId", "props", "slots", "events")
      val ref = objectValue.string("ref")
      val implementationId = objectValue.string("implementationId")
      if (!ViraAndroidSemanticIdentifier.isNamespace(ref, requiresDot = true) || !ViraAndroidSemanticIdentifier.isNamespace(implementationId, requiresDot = true)) invalid()
      val props = objectValue.required("props").asArrayOrNull()?.map { rawProp ->
        val item = rawProp.objectOptional("options", required = setOf("key", "type", "required", "bindable"))
        val type = ViraAndroidCatalogValueType.fromWire(item.string("type")) ?: invalid()
        val options = item["options"]?.asArrayOrNull()?.map { it.asStringOrNull() ?: invalid() }
        if (type == ViraAndroidCatalogValueType.ENUM) {
          if (options.isNullOrEmpty() || options.toSet().size != options.size) invalid()
        } else if (options != null) invalid()
        ViraAndroidPropDefinition(item.string("key"), type, item.boolean("required"), item.boolean("bindable"), options)
      } ?: invalid()
      val slots = objectValue.required("slots").asArrayOrNull()?.map { it.asStringOrNull() ?: invalid() } ?: invalid()
      val events = objectValue.required("events").asArrayOrNull()?.map(::decodeEvent) ?: invalid()
      if (props.map { it.key }.toSet().size != props.size || props.any { it.key.isBlank() }) invalid()
      if (slots.toSet().size != slots.size || slots.any { it.isBlank() }) invalid()
      if (events.map { it.name }.toSet().size != events.size) invalid()
      return ViraAndroidComponentDefinition(ref, implementationId, props, slots, events)
    }

    private fun decodeEvent(raw: ViraJson): ViraAndroidEventDefinition {
      val objectValue = raw.objectOptional("payload", required = setOf("name"))
      val name = objectValue.string("name")
      if (name.isBlank()) invalid()
      val payload = objectValue["payload"]?.asArrayOrNull()?.map { rawField ->
        val item = rawField.objectOptional("options", required = setOf("key", "type", "required"))
        val type = ViraAndroidCatalogValueType.fromWire(item.string("type")) ?: invalid()
        val options = item["options"]?.asArrayOrNull()?.map { it.asStringOrNull() ?: invalid() }
        if (type == ViraAndroidCatalogValueType.ENUM) {
          if (options.isNullOrEmpty() || options.toSet().size != options.size) invalid()
        } else if (options != null) invalid()
        ViraAndroidEventPayloadDefinition(item.string("key"), type, item.boolean("required"), options)
      }
      if (payload != null && (payload.map { it.key }.toSet().size != payload.size || payload.any { it.key.isBlank() })) invalid()
      return ViraAndroidEventDefinition(name, payload)
    }

    private fun invalid(): Nothing = throw IllegalArgumentException("invalid native mount envelope")
  }
}

private fun ViraJson.objectExact(vararg fields: String): Map<String, ViraJson> {
  val objectValue = asObjectOrNull() ?: throw IllegalArgumentException("expected object")
  if (objectValue.keys != fields.toSet()) throw IllegalArgumentException("unknown field")
  return objectValue
}

private fun ViraJson.objectOptional(optional: String, required: Set<String>): Map<String, ViraJson> {
  val objectValue = asObjectOrNull() ?: throw IllegalArgumentException("expected object")
  val allowed = required + optional
  if (!objectValue.keys.all { it in allowed } || !required.all { it in objectValue }) throw IllegalArgumentException("invalid fields")
  return objectValue
}

private fun Map<String, ViraJson>.required(key: String): ViraJson = this[key] ?: throw IllegalArgumentException("missing $key")
private fun Map<String, ViraJson>.string(key: String): String = required(key).asStringOrNull() ?: throw IllegalArgumentException("expected string")
private fun Map<String, ViraJson>.boolean(key: String): Boolean = required(key).asBooleanOrNull() ?: throw IllegalArgumentException("expected boolean")
