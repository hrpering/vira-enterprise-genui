enum class ViraAndroidPermissionSubject(val wire: String) {
  ACTION("action"),
  CAPABILITY("capability");

  companion object {
    fun fromWire(value: String): ViraAndroidPermissionSubject? = entries.firstOrNull { it.wire == value }
  }
}

enum class ViraAndroidPermissionEffect(val wire: String) {
  ALLOW("allow"),
  DENY("deny"),
  CONFIRM("confirm");

  companion object {
    fun fromWire(value: String): ViraAndroidPermissionEffect? = entries.firstOrNull { it.wire == value }
  }
}

data class ViraAndroidPermissionRule(
  val subject: ViraAndroidPermissionSubject,
  val id: String,
  val effect: ViraAndroidPermissionEffect,
)

class ViraAndroidPermissionPolicy private constructor(
  private val rules: List<ViraAndroidPermissionRule>,
) {
  fun effect(subject: ViraAndroidPermissionSubject, id: String): ViraAndroidPermissionEffect =
    rules.firstOrNull { it.subject == subject && it.id == id }?.effect ?: ViraAndroidPermissionEffect.DENY

  companion object {
    fun decode(text: String): Result<ViraAndroidPermissionPolicy> = runCatching {
      val root = ViraAndroidCanonicalJson.decode(text).asObjectOrNull() ?: invalid()
      if (root.keys != setOf("version", "rules")) invalid()
      if (root["version"]?.asStringOrNull() != "1") invalid()
      val rawRules = root["rules"]?.asArrayOrNull() ?: invalid()
      if (rawRules.size > 512) invalid()
      val output = mutableListOf<ViraAndroidPermissionRule>()
      val seen = mutableSetOf<Pair<ViraAndroidPermissionSubject, String>>()
      for (raw in rawRules) {
        val objectValue = raw.asObjectOrNull() ?: invalid()
        if (objectValue.keys != setOf("subject", "id", "effect")) invalid()
        val subject = ViraAndroidPermissionSubject.fromWire(objectValue["subject"]?.asStringOrNull() ?: invalid()) ?: invalid()
        val id = objectValue["id"]?.asStringOrNull() ?: invalid()
        val effect = ViraAndroidPermissionEffect.fromWire(objectValue["effect"]?.asStringOrNull() ?: invalid()) ?: invalid()
        if (!ViraAndroidSemanticIdentifier.isNamespace(id)) invalid()
        if (!seen.add(subject to id)) invalid()
        output += ViraAndroidPermissionRule(subject, id, effect)
      }
      ViraAndroidPermissionPolicy(output.toList())
    }.recoverCatching {
      throw ViraAndroidIssue(
        ViraAndroidIssueCode.INVALID_PERMISSION_POLICY,
        "$",
        "native permission policy is invalid",
      )
    }

    fun create(rules: List<ViraAndroidPermissionRule>): Result<ViraAndroidPermissionPolicy> = runCatching {
      if (rules.size > 512) invalid()
      val seen = mutableSetOf<Pair<ViraAndroidPermissionSubject, String>>()
      for (rule in rules) {
        if (!ViraAndroidSemanticIdentifier.isNamespace(rule.id) || !seen.add(rule.subject to rule.id)) invalid()
      }
      ViraAndroidPermissionPolicy(rules.toList())
    }.recoverCatching {
      throw ViraAndroidIssue(
        ViraAndroidIssueCode.INVALID_PERMISSION_POLICY,
        "$",
        "native permission policy is invalid",
      )
    }

    private fun invalid(): Nothing = throw IllegalArgumentException("invalid permission policy")
  }
}
