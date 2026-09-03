internal object ViraAndroidCanonicalJson {
  private const val MAX_DEPTH = 64
  private const val MAX_NODES = 100_000
  private const val MAX_CONTAINER_ITEMS = 50_000
  private const val MAX_STRING_UNITS = 1_048_576
  private const val MAX_KEY_UNITS = 4_096
  private const val MAX_TOTAL_STRING_UNITS = 4_194_304
  private const val MAX_SOURCE_UNITS = 16_777_216

  fun decode(text: String): ViraJson {
    if (text.length > MAX_SOURCE_UNITS) throw IllegalArgumentException("invalid canonical JSON")
    return Parser(text).parse()
  }

  fun encode(value: ViraJson): String {
    if (!isCanonical(value)) throw IllegalArgumentException("invalid canonical JSON")
    return Writer.write(value)
  }

  fun isCanonical(value: ViraJson): Boolean {
    val budget = Budget()
    return validate(value, 0, budget)
  }

  private data class Budget(
    var nodes: Int = 0,
    var stringUnits: Int = 0,
  )

  private fun validate(value: ViraJson, depth: Int, budget: Budget): Boolean {
    if (depth > MAX_DEPTH) return false
    budget.nodes += 1
    if (budget.nodes > MAX_NODES) return false
    return when (value) {
      ViraJson.Null, is ViraJson.Bool -> true
      is ViraJson.Num -> value.value.isFinite() && value.value.toRawBits() != (-0.0).toRawBits()
      is ViraJson.Str -> addStringBudget(value.value.length, MAX_STRING_UNITS, budget)
      is ViraJson.Arr -> {
        if (value.value.size > MAX_CONTAINER_ITEMS) return false
        value.value.all { validate(it, depth + 1, budget) }
      }
      is ViraJson.Obj -> {
        if (value.value.size > MAX_CONTAINER_ITEMS) return false
        value.value.all { (key, child) ->
          addStringBudget(key.length, MAX_KEY_UNITS, budget) && validate(child, depth + 1, budget)
        }
      }
    }
  }

  private fun addStringBudget(units: Int, perValueLimit: Int, budget: Budget): Boolean {
    if (units > perValueLimit) return false
    budget.stringUnits += units
    return budget.stringUnits <= MAX_TOTAL_STRING_UNITS
  }

  private class Parser(private val source: String) {
    private var index = 0
    private val budget = Budget()

    fun parse(): ViraJson {
      val value = parseValue(0)
      whitespace()
      if (index != source.length) invalid()
      return value
    }

    private fun node(depth: Int) {
      if (depth > MAX_DEPTH) invalid()
      budget.nodes += 1
      if (budget.nodes > MAX_NODES) invalid()
    }

    private fun stringBudget(units: Int, limit: Int) {
      if (units > limit) invalid()
      budget.stringUnits += units
      if (budget.stringUnits > MAX_TOTAL_STRING_UNITS) invalid()
    }

    private fun whitespace() {
      while (index < source.length) {
        when (source[index]) {
          ' ', '\t', '\r', '\n' -> index += 1
          else -> return
        }
      }
    }

    private fun parseValue(depth: Int): ViraJson {
      whitespace()
      if (index >= source.length) invalid()
      node(depth)
      return when (source[index]) {
        '{' -> parseObject(depth)
        '[' -> parseArray(depth)
        '"' -> ViraJson.Str(parseString(MAX_STRING_UNITS))
        't' -> { literal("true"); ViraJson.Bool(true) }
        'f' -> { literal("false"); ViraJson.Bool(false) }
        'n' -> { literal("null"); ViraJson.Null }
        else -> parseNumber()
      }
    }

    private fun literal(value: String) {
      if (!source.startsWith(value, index)) invalid()
      index += value.length
    }

    private fun parseObject(depth: Int): ViraJson.Obj {
      index += 1
      whitespace()
      val output = linkedMapOf<String, ViraJson>()
      if (index < source.length && source[index] == '}') {
        index += 1
        return ViraJson.Obj(output)
      }
      while (true) {
        if (output.size >= MAX_CONTAINER_ITEMS) invalid()
        whitespace()
        val key = parseString(MAX_KEY_UNITS)
        whitespace()
        if (index >= source.length || source[index++] != ':') invalid()
        if (output.put(key, parseValue(depth + 1)) != null) invalid()
        whitespace()
        if (index < source.length && source[index] == '}') {
          index += 1
          break
        }
        if (index >= source.length || source[index++] != ',') invalid()
      }
      return ViraJson.Obj(output)
    }

    private fun parseArray(depth: Int): ViraJson.Arr {
      index += 1
      whitespace()
      val output = mutableListOf<ViraJson>()
      if (index < source.length && source[index] == ']') {
        index += 1
        return ViraJson.Arr(output)
      }
      while (true) {
        if (output.size >= MAX_CONTAINER_ITEMS) invalid()
        output += parseValue(depth + 1)
        whitespace()
        if (index < source.length && source[index] == ']') {
          index += 1
          break
        }
        if (index >= source.length || source[index++] != ',') invalid()
      }
      return ViraJson.Arr(output)
    }

    private fun parseString(limit: Int): String {
      if (index >= source.length || source[index++] != '"') invalid()
      val output = StringBuilder()
      while (index < source.length) {
        val character = source[index++]
        if (character == '"') {
          val value = output.toString()
          stringBudget(value.length, limit)
          return value
        }
        if (character.code < 0x20) invalid()
        if (character == '\\') {
          if (index >= source.length) invalid()
          when (val escaped = source[index++]) {
            '"' -> output.append('"')
            '\\' -> output.append('\\')
            '/' -> output.append('/')
            'b' -> output.append('\b')
            'f' -> output.append('\u000C')
            'n' -> output.append('\n')
            'r' -> output.append('\r')
            't' -> output.append('\t')
            'u' -> {
              if (index + 4 > source.length) invalid()
              val code = source.substring(index, index + 4).toIntOrNull(16) ?: invalid()
              output.append(code.toChar())
              index += 4
            }
            else -> invalid()
          }
        } else {
          output.append(character)
        }
        if (output.length > limit) invalid()
      }
      invalid()
    }

    private fun parseNumber(): ViraJson.Num {
      val start = index
      if (source[index] == '-') index += 1
      if (index >= source.length) invalid()
      if (source[index] == '0') {
        index += 1
        if (index < source.length && source[index].isDigit()) invalid()
      } else {
        if (!source[index].isDigit()) invalid()
        while (index < source.length && source[index].isDigit()) index += 1
      }
      if (index < source.length && source[index] == '.') {
        index += 1
        val fractionStart = index
        while (index < source.length && source[index].isDigit()) index += 1
        if (index == fractionStart) invalid()
      }
      if (index < source.length && (source[index] == 'e' || source[index] == 'E')) {
        index += 1
        if (index < source.length && (source[index] == '+' || source[index] == '-')) index += 1
        val exponentStart = index
        while (index < source.length && source[index].isDigit()) index += 1
        if (index == exponentStart) invalid()
      }
      val number = source.substring(start, index).toDoubleOrNull() ?: invalid()
      if (!number.isFinite() || number.toRawBits() == (-0.0).toRawBits()) invalid()
      return ViraJson.Num(number)
    }

    private fun invalid(): Nothing = throw IllegalArgumentException("invalid canonical JSON")
  }

  private object Writer {
    fun write(value: ViraJson): String = when (value) {
      ViraJson.Null -> "null"
      is ViraJson.Bool -> if (value.value) "true" else "false"
      is ViraJson.Num -> value.value.toString()
      is ViraJson.Str -> quote(value.value)
      is ViraJson.Arr -> value.value.joinToString(prefix = "[", postfix = "]", separator = ",") { write(it) }
      is ViraJson.Obj -> value.value.entries.joinToString(prefix = "{", postfix = "}", separator = ",") {
        quote(it.key) + ":" + write(it.value)
      }
    }

    private fun quote(value: String): String {
      val output = StringBuilder("\"")
      for (character in value) {
        when (character) {
          '"' -> output.append("\\\"")
          '\\' -> output.append("\\\\")
          '\b' -> output.append("\\b")
          '\u000C' -> output.append("\\f")
          '\n' -> output.append("\\n")
          '\r' -> output.append("\\r")
          '\t' -> output.append("\\t")
          else -> if (character.code < 0x20) {
            output.append("\\u%04x".format(character.code))
          } else {
            output.append(character)
          }
        }
      }
      return output.append('"').toString()
    }
  }
}

internal fun ViraJson.asObjectOrNull(): Map<String, ViraJson>? = (this as? ViraJson.Obj)?.value
internal fun ViraJson.asStringOrNull(): String? = (this as? ViraJson.Str)?.value
internal fun ViraJson.asArrayOrNull(): List<ViraJson>? = (this as? ViraJson.Arr)?.value
internal fun ViraJson.asBooleanOrNull(): Boolean? = (this as? ViraJson.Bool)?.value
internal fun ViraJson.asNumberOrNull(): Double? = (this as? ViraJson.Num)?.value
