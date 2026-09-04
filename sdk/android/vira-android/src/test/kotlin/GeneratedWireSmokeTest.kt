import org.junit.Assert.assertEquals
import org.junit.Test

class GeneratedWireSmokeTest {
  @Test
  fun generatedExperienceWireDecodesInsideAndroidModule() {
    val document = ViraStudioCodec.decodeDocument(
      """
      {
        "version":"1",
        "id":"demo.android",
        "recipeId":"demo.android.recipe",
        "entryView":"main",
        "views":[{"id":"main","nodes":[]}],
        "bindings":[],
        "interactions":[]
      }
      """.trimIndent()
    )

    assertEquals("1", document.version)
    assertEquals("demo.android", document.id)
    assertEquals("main", document.entryView)
    assertEquals(VIRA_ANDROID_PLATFORM, "android")
  }
}
