import java.io.File

fun main(args:Array<String>) {
  require(args.size >= 3) { "valid, invalid-version and missing-required fixture paths required" }
  val input = File(args[0]).readText()
  val first = ViraStudioCodec.decodeDocument(input)
  val output = ViraStudioCodec.encodeDocument(first)
  val second = ViraStudioCodec.decodeDocument(output)
  check(first == second) { "semantic model mismatch" }
  for (path in args.drop(1)) {
    val rejected = runCatching { ViraStudioCodec.decodeDocument(File(path).readText()) }.isFailure
    check(rejected) { "invalid fixture decoded successfully: $path" }
  }
  println("KOTLIN_CONFORMANCE_OK")
}
