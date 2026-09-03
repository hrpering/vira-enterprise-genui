object ViraAndroidSemanticIdentifier {
  fun isSegment(value: String): Boolean {
    if (value.isEmpty() || value.length > 128) return false
    if (value[0] !in 'a'..'z') return false
    var previousHyphen = false
    for (character in value.drop(1)) {
      val valid = character in 'a'..'z' || character in '0'..'9' || character == '-'
      if (!valid || (character == '-' && previousHyphen)) return false
      previousHyphen = character == '-'
    }
    return value.last() != '-'
  }

  fun isNamespace(value: String, requiresDot: Boolean = false): Boolean {
    if (value.isEmpty() || value.length > 4_096) return false
    val segments = value.split('.')
    if (requiresDot && segments.size < 2) return false
    return segments.isNotEmpty() && segments.all(::isSegment)
  }

  fun isScopePath(value: String): Boolean {
    if (!value.startsWith("currentItem.")) return false
    return isNamespace(value.removePrefix("currentItem."))
  }
}
