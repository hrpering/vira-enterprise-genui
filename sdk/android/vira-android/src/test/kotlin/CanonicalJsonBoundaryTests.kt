import org.junit.Assert.assertTrue
import org.junit.Test

class CanonicalJsonBoundaryTests {
  @Test
  fun rejectsNonJsonUnicodeWhitespaceAtWireBoundary() {
    val input = "{\u00a0\"ok\":true}"
    assertTrue(runCatching { ViraAndroidCanonicalJson.decode(input) }.isFailure)
  }

  @Test
  fun acceptsOnlyCanonicalJsonWhitespaceCharacters() {
    val input = " \t\r\n{\"ok\":true}\n"
    assertTrue(runCatching { ViraAndroidCanonicalJson.decode(input) }.isSuccess)
  }
}
