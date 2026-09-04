enum class ViraAndroidRuntimeCoreLifecycle(val wire: String) {
  CREATED("created"),
  MOUNTING("mounting"),
  ACTIVE("active"),
  UPDATING("updating"),
  COMPLETED("completed"),
  CANCELLED("cancelled"),
  FAILED("failed"),
  DISPOSED("disposed");

  companion object { fun fromWire(value: String) = entries.firstOrNull { it.wire == value } }
}

data class ViraAndroidRuntimeCoreState(
  val experienceId: String,
  val revision: Long,
  val lifecycle: ViraAndroidRuntimeCoreLifecycle,
  val plan: ViraJson,
) {
  companion object {
    fun decode(text: String): Result<ViraAndroidRuntimeCoreState> = runCatching {
      val root = ViraAndroidCanonicalJson.decode(text).asObjectOrNull() ?: invalid()
      if (root.keys != setOf("experienceId", "revision", "lifecycle", "plan")) invalid()
      val experienceId = root["experienceId"]?.asStringOrNull() ?: invalid()
      val revisionNumber = root["revision"]?.asNumberOrNull() ?: invalid()
      val lifecycle = ViraAndroidRuntimeCoreLifecycle.fromWire(root["lifecycle"]?.asStringOrNull() ?: invalid()) ?: invalid()
      val plan = root["plan"] ?: invalid()
      if (!safePlanId(experienceId) || revisionNumber < 0 || revisionNumber > VIRA_ANDROID_MAX_SAFE_INTEGER.toDouble() || revisionNumber % 1.0 != 0.0) invalid()
      val normalizedPlan = normalizePlan(plan) ?: invalid()
      ViraAndroidRuntimeCoreState(experienceId, revisionNumber.toLong(), lifecycle, normalizedPlan)
    }.recoverCatching { error ->
      if (error is ViraAndroidIssue) throw error
      throw ViraAndroidIssue(ViraAndroidIssueCode.INVALID_RUNTIME_STATE, "$", "native Runtime Core state is invalid")
    }
  }
}

private sealed interface ViraAndroidPreparedRuntimeAction {
  data class Patch(val value: ViraAndroidPatch) : ViraAndroidPreparedRuntimeAction
  data class Lifecycle(val value: ViraAndroidRuntimeCoreLifecycle) : ViraAndroidPreparedRuntimeAction
  data object Host : ViraAndroidPreparedRuntimeAction
}

private sealed interface ViraAndroidPatchOperation {
  val path: List<String>
  data class Set(override val path: List<String>, val value: ViraJson) : ViraAndroidPatchOperation
  data class Remove(override val path: List<String>) : ViraAndroidPatchOperation
  data class Merge(override val path: List<String>, val value: Map<String, ViraJson>) : ViraAndroidPatchOperation
  data class Append(override val path: List<String>, val value: ViraJson) : ViraAndroidPatchOperation
  data class Replace(override val path: List<String>, val value: ViraJson) : ViraAndroidPatchOperation
}

private data class ViraAndroidPatch(val operations: List<ViraAndroidPatchOperation>)
private val VIRA_ANDROID_UNSAFE_PATCH_KEYS = setOf("__proto__", "prototype", "constructor")
private val VIRA_ANDROID_TERMINAL_LIFECYCLES = setOf(
  ViraAndroidRuntimeCoreLifecycle.COMPLETED,
  ViraAndroidRuntimeCoreLifecycle.CANCELLED,
  ViraAndroidRuntimeCoreLifecycle.FAILED,
  ViraAndroidRuntimeCoreLifecycle.DISPOSED,
)

internal class ViraAndroidRuntimeCoreSession(initial: ViraAndroidRuntimeCoreState) {
  private var stateValue = initial

  fun state(): ViraAndroidRuntimeCoreState = stateValue

  fun process(
    actionType: String,
    payload: Map<String, ViraJson>,
    permissionEffect: ViraAndroidPermissionEffect,
  ): Result<Boolean> = runCatching {
    if (!ViraAndroidSemanticIdentifier.isNamespace(actionType)) {
      throw issue(ViraAndroidIssueCode.RUNTIME_REDUCTION_FAILED, "$.action.type", "runtime action type is invalid")
    }
    if (!ViraAndroidCanonicalJson.isCanonical(ViraJson.Obj(payload))) {
      throw issue(ViraAndroidIssueCode.INVALID_EVENT_PAYLOAD, "$.action.payload", "runtime action payload is not canonical JSON")
    }

    val prepared = prepare(actionType, payload)
    when (permissionEffect) {
      ViraAndroidPermissionEffect.DENY -> throw issue(ViraAndroidIssueCode.PERMISSION_DENIED, "$.action.type", "native runtime permission denied")
      ViraAndroidPermissionEffect.CONFIRM -> throw issue(ViraAndroidIssueCode.CONFIRMATION_REQUIRED, "$.action.type", "native runtime confirmation is required before execution")
      ViraAndroidPermissionEffect.ALLOW -> Unit
    }

    when (prepared) {
      ViraAndroidPreparedRuntimeAction.Host -> true
      is ViraAndroidPreparedRuntimeAction.Lifecycle -> {
        reduceLifecycle(prepared.value)
        false
      }
      is ViraAndroidPreparedRuntimeAction.Patch -> {
        reducePatch(prepared.value)
        false
      }
    }
  }

  private fun prepare(actionType: String, payload: Map<String, ViraJson>): ViraAndroidPreparedRuntimeAction {
    if (actionType == "runtime.patch.apply") {
      if (payload.keys != setOf("patch")) {
        throw issue(ViraAndroidIssueCode.INVALID_EVENT_PAYLOAD, "$.action.payload", "runtime patch action requires exactly patch")
      }
      if (stateValue.lifecycle in VIRA_ANDROID_TERMINAL_LIFECYCLES) {
        throw issue(ViraAndroidIssueCode.RUNTIME_REDUCTION_FAILED, "$.lifecycle", "runtime patch is rejected in terminal lifecycle")
      }
      if (stateValue.revision >= VIRA_ANDROID_MAX_SAFE_INTEGER) revisionOverflow()
      val patch = parsePatch(payload.getValue("patch"))
        ?: throw issue(ViraAndroidIssueCode.RUNTIME_REDUCTION_FAILED, "$.action.payload.patch", "runtime patch is invalid")
      return ViraAndroidPreparedRuntimeAction.Patch(patch)
    }

    if (actionType == "runtime.lifecycle.transition") {
      if (payload.keys != setOf("target")) {
        throw issue(ViraAndroidIssueCode.RUNTIME_REDUCTION_FAILED, "$.action.payload.target", "runtime lifecycle transition is invalid")
      }
      val target = ViraAndroidRuntimeCoreLifecycle.fromWire(payload["target"]?.asStringOrNull() ?: "")
        ?: throw issue(ViraAndroidIssueCode.RUNTIME_REDUCTION_FAILED, "$.action.payload.target", "runtime lifecycle transition is invalid")
      if (!canTransition(stateValue.lifecycle, target)) {
        throw issue(ViraAndroidIssueCode.RUNTIME_REDUCTION_FAILED, "$.action.payload.target", "runtime lifecycle transition is invalid")
      }
      if (stateValue.revision >= VIRA_ANDROID_MAX_SAFE_INTEGER) revisionOverflow()
      return ViraAndroidPreparedRuntimeAction.Lifecycle(target)
    }

    if (stateValue.lifecycle in VIRA_ANDROID_TERMINAL_LIFECYCLES) {
      throw issue(ViraAndroidIssueCode.RUNTIME_ACTION_UNHANDLED, "$.lifecycle", "runtime action is unavailable in terminal lifecycle")
    }
    return ViraAndroidPreparedRuntimeAction.Host
  }

  private fun reduceLifecycle(target: ViraAndroidRuntimeCoreLifecycle) {
    if (stateValue.revision >= VIRA_ANDROID_MAX_SAFE_INTEGER) revisionOverflow()
    stateValue = stateValue.copy(revision = stateValue.revision + 1, lifecycle = target)
  }

  private fun reducePatch(patch: ViraAndroidPatch) {
    if (patch.operations.isEmpty()) return
    if (stateValue.revision >= VIRA_ANDROID_MAX_SAFE_INTEGER) revisionOverflow()
    val plan = applyPatch(stateValue.plan, patch)
      ?: throw issue(ViraAndroidIssueCode.RUNTIME_REDUCTION_FAILED, "$.action.payload.patch", "runtime patch could not be applied canonically")
    stateValue = stateValue.copy(revision = stateValue.revision + 1, plan = plan)
  }

  private fun revisionOverflow(): Nothing = throw issue(
    ViraAndroidIssueCode.REVISION_OVERFLOW,
    "$.revision",
    "runtime revision cannot be incremented safely",
  )
}

private fun parsePatch(value: ViraJson): ViraAndroidPatch? {
  val root = value.asObjectOrNull() ?: return null
  if (root.keys != setOf("version", "operations") || root["version"]?.asStringOrNull() != "1") return null
  val rawOperations = root["operations"]?.asArrayOrNull() ?: return null
  if (rawOperations.size > 256) return null
  val operations = mutableListOf<ViraAndroidPatchOperation>()
  for (rawOperation in rawOperations) {
    val fields = rawOperation.asObjectOrNull() ?: return null
    val operation = fields["op"]?.asStringOrNull() ?: return null
    val path = patchPath(fields["path"]?.asStringOrNull() ?: return null) ?: return null
    if (operation == "remove") {
      if (fields.keys != setOf("op", "path")) return null
      operations += ViraAndroidPatchOperation.Remove(path)
      continue
    }
    if (operation !in setOf("set", "merge", "append", "replace") || fields.keys != setOf("op", "path", "value")) return null
    val patchValue = fields["value"] ?: return null
    if (!patchValueIsSafe(patchValue)) return null
    operations += when (operation) {
      "set" -> ViraAndroidPatchOperation.Set(path, patchValue)
      "append" -> ViraAndroidPatchOperation.Append(path, patchValue)
      "replace" -> ViraAndroidPatchOperation.Replace(path, patchValue)
      "merge" -> ViraAndroidPatchOperation.Merge(path, patchValue.asObjectOrNull() ?: return null)
      else -> return null
    }
  }
  return ViraAndroidPatch(operations)
}

private fun patchPath(value: String): List<String>? {
  if (value.length !in 2..1_024 || !value.startsWith('/')) return null
  if (value.any { it.code <= 31 || it.code == 127 }) return null
  val output = mutableListOf<String>()
  for (raw in value.drop(1).split('/')) {
    if (raw.isEmpty()) return null
    var index = 0
    while (index < raw.length) {
      if (raw[index] == '~') {
        if (index + 1 >= raw.length || raw[index + 1] !in setOf('0', '1')) return null
        index += 2
      } else index += 1
    }
    val decoded = raw.replace("~1", "/").replace("~0", "~")
    if (decoded in VIRA_ANDROID_UNSAFE_PATCH_KEYS || decoded.any { it.code <= 31 || it.code == 127 }) return null
    output += decoded
  }
  return output
}

private fun patchValueIsSafe(value: ViraJson): Boolean {
  if (!ViraAndroidCanonicalJson.isCanonical(value)) return false
  return when (value) {
    is ViraJson.Arr -> value.value.all(::patchValueIsSafe)
    is ViraJson.Obj -> value.value.keys.none { it in VIRA_ANDROID_UNSAFE_PATCH_KEYS } && value.value.values.all(::patchValueIsSafe)
    else -> true
  }
}

private fun applyPatch(plan: ViraJson, patch: ViraAndroidPatch): ViraJson? {
  var current = plan
  for (operation in patch.operations) {
    current = patchTarget(current, operation.path, 0, operation) ?: return null
  }
  return normalizePlan(current)
}

private fun patchTarget(
  current: ViraJson,
  path: List<String>,
  index: Int,
  operation: ViraAndroidPatchOperation,
): ViraJson? {
  if (index >= path.size) return null
  val token = path[index]
  val leaf = index == path.lastIndex
  return when (current) {
    is ViraJson.Obj -> {
      val output = current.value.toMutableMap()
      if (leaf) {
        when (operation) {
          is ViraAndroidPatchOperation.Set -> output[token] = operation.value
          is ViraAndroidPatchOperation.Replace -> if (token in output) output[token] = operation.value else return null
          is ViraAndroidPatchOperation.Remove -> if (output.remove(token) == null) return null
          is ViraAndroidPatchOperation.Append -> {
            val target = output[token] as? ViraJson.Arr ?: return null
            output[token] = ViraJson.Arr(target.value + operation.value)
          }
          is ViraAndroidPatchOperation.Merge -> {
            val target = output[token] as? ViraJson.Obj ?: return null
            output[token] = ViraJson.Obj(target.value + operation.value)
          }
        }
      } else {
        val child = output[token] ?: return null
        output[token] = patchTarget(child, path, index + 1, operation) ?: return null
      }
      ViraJson.Obj(output)
    }
    is ViraJson.Arr -> {
      val childIndex = arrayIndex(token, current.value.size) ?: return null
      val output = current.value.toMutableList()
      if (leaf) {
        when (operation) {
          is ViraAndroidPatchOperation.Set -> output[childIndex] = operation.value
          is ViraAndroidPatchOperation.Replace -> output[childIndex] = operation.value
          is ViraAndroidPatchOperation.Remove -> output.removeAt(childIndex)
          is ViraAndroidPatchOperation.Append -> {
            val target = output[childIndex] as? ViraJson.Arr ?: return null
            output[childIndex] = ViraJson.Arr(target.value + operation.value)
          }
          is ViraAndroidPatchOperation.Merge -> {
            val target = output[childIndex] as? ViraJson.Obj ?: return null
            output[childIndex] = ViraJson.Obj(target.value + operation.value)
          }
        }
      } else {
        output[childIndex] = patchTarget(output[childIndex], path, index + 1, operation) ?: return null
      }
      ViraJson.Arr(output)
    }
    else -> null
  }
}

private fun arrayIndex(token: String, count: Int): Int? {
  if (!Regex("^(0|[1-9][0-9]*)$").matches(token)) return null
  val index = token.toIntOrNull() ?: return null
  return index.takeIf { it in 0 until count }
}

private fun canTransition(from: ViraAndroidRuntimeCoreLifecycle, to: ViraAndroidRuntimeCoreLifecycle): Boolean = when (from) {
  ViraAndroidRuntimeCoreLifecycle.CREATED -> to in setOf(ViraAndroidRuntimeCoreLifecycle.MOUNTING, ViraAndroidRuntimeCoreLifecycle.CANCELLED, ViraAndroidRuntimeCoreLifecycle.FAILED)
  ViraAndroidRuntimeCoreLifecycle.MOUNTING -> to in setOf(ViraAndroidRuntimeCoreLifecycle.ACTIVE, ViraAndroidRuntimeCoreLifecycle.CANCELLED, ViraAndroidRuntimeCoreLifecycle.FAILED)
  ViraAndroidRuntimeCoreLifecycle.ACTIVE -> to in setOf(ViraAndroidRuntimeCoreLifecycle.UPDATING, ViraAndroidRuntimeCoreLifecycle.COMPLETED, ViraAndroidRuntimeCoreLifecycle.CANCELLED, ViraAndroidRuntimeCoreLifecycle.FAILED)
  ViraAndroidRuntimeCoreLifecycle.UPDATING -> to in setOf(ViraAndroidRuntimeCoreLifecycle.ACTIVE, ViraAndroidRuntimeCoreLifecycle.COMPLETED, ViraAndroidRuntimeCoreLifecycle.CANCELLED, ViraAndroidRuntimeCoreLifecycle.FAILED)
  ViraAndroidRuntimeCoreLifecycle.COMPLETED,
  ViraAndroidRuntimeCoreLifecycle.CANCELLED,
  ViraAndroidRuntimeCoreLifecycle.FAILED -> to == ViraAndroidRuntimeCoreLifecycle.DISPOSED
  ViraAndroidRuntimeCoreLifecycle.DISPOSED -> false
}

private fun normalizePlan(value: ViraJson): ViraJson? {
  if (!ViraAndroidCanonicalJson.isCanonical(value)) return null
  val root = value.asObjectOrNull() ?: return null
  if (!root.keys.all { it in setOf("version", "id", "intent", "state", "capabilities") }) return null
  if (root["version"]?.asStringOrNull() != "1") return null
  val id = root["id"]?.asStringOrNull() ?: return null
  if (!safePlanId(id)) return null
  val intent = normalizeIntent(root["intent"] ?: return null) ?: return null
  val state = root["state"]?.asObjectOrNull() ?: return null
  val capabilities = root["capabilities"]?.asObjectOrNull() ?: return null
  if (!capabilities.keys.all { it in setOf("required", "available", "future") }) return null

  val seen = mutableSetOf<String>()
  var total = 0
  val normalizedBuckets = linkedMapOf<String, ViraJson>()
  for (bucket in listOf("required", "available", "future")) {
    val entries = capabilities[bucket]?.asArrayOrNull() ?: emptyList()
    if (entries.size > 256) return null
    total += entries.size
    if (total > 256) return null
    val normalized = mutableListOf<ViraJson>()
    for (entry in entries) {
      val capability = normalizeCapability(entry) ?: return null
      val capabilityId = capability.value.getValue("id").asStringOrNull() ?: return null
      if (!seen.add(capabilityId)) return null
      normalized += capability
    }
    normalizedBuckets[bucket] = ViraJson.Arr(normalized)
  }

  return ViraJson.Obj(linkedMapOf(
    "version" to ViraJson.Str("1"),
    "id" to ViraJson.Str(id),
    "intent" to intent,
    "state" to ViraJson.Obj(state),
    "capabilities" to ViraJson.Obj(normalizedBuckets),
  ))
}

private fun normalizeIntent(value: ViraJson): ViraJson? {
  val root = value.asObjectOrNull() ?: return null
  if (!root.keys.all { it in setOf("version", "namespace", "name", "confidence", "parameters") }) return null
  if (root["version"]?.asStringOrNull() != "1") return null
  val namespace = root["namespace"]?.asStringOrNull() ?: return null
  val name = root["name"]?.asStringOrNull() ?: return null
  if (!semanticNamespace255(namespace) || !semanticSegment63(name)) return null
  val output = linkedMapOf<String, ViraJson>(
    "version" to ViraJson.Str("1"),
    "namespace" to ViraJson.Str(namespace),
    "name" to ViraJson.Str(name),
  )
  root["confidence"]?.let { raw ->
    val confidence = raw.asNumberOrNull() ?: return null
    if (!confidence.isFinite() || confidence.toRawBits() == (-0.0).toRawBits() || confidence !in 0.0..1.0) return null
    output["confidence"] = ViraJson.Num(confidence)
  }
  root["parameters"]?.let { raw ->
    if (raw.asObjectOrNull() == null || !ViraAndroidCanonicalJson.isCanonical(raw)) return null
    output["parameters"] = raw
  }
  return ViraJson.Obj(output)
}

private fun normalizeCapability(value: ViraJson): ViraJson.Obj? {
  val root = value.asObjectOrNull() ?: return null
  if (root.keys != setOf("version", "id") || root["version"]?.asStringOrNull() != "1") return null
  val id = root["id"]?.asStringOrNull() ?: return null
  if (!semanticNamespace255(id)) return null
  return ViraJson.Obj(linkedMapOf("version" to ViraJson.Str("1"), "id" to ViraJson.Str(id)))
}

private fun safePlanId(value: String): Boolean = value.isNotEmpty() && value.length <= 128 && Regex("^[A-Za-z0-9][A-Za-z0-9._:-]*$").matches(value)
private fun semanticNamespace255(value: String): Boolean = value.isNotEmpty() && value.length <= 255 && value.split('.').all(::semanticSegment63)
private fun semanticSegment63(value: String): Boolean = value.isNotEmpty() && value.length <= 63 && Regex("^[a-z](?:[a-z0-9]|-(?!-))*[a-z0-9]$|^[a-z]$").matches(value)
private fun issue(code: ViraAndroidIssueCode, path: String, message: String) = ViraAndroidIssue(code, path, message)
private fun invalid(): Nothing = throw IllegalArgumentException("invalid runtime state")
