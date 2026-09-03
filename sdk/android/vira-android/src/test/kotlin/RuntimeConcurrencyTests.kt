import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine
import kotlin.coroutines.suspendCoroutine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

private const val concurrentEnvelope = """
{
  "version":"1",
  "instanceId":"instance-concurrent",
  "deploymentId":"deployment-concurrent",
  "pack":{"id":"demo.pack","version":"1.0.0","entrypoint":"main"},
  "artifact":{"id":"main","role":"studio-publication","mediaType":"application/json","digest":"sha256-demo"},
  "compatibility":{"hostId":"demo.host.android","platform":"android"},
  "host":{"version":"1","id":"demo.host.android","platform":"android","implementationIds":["demo.android.button"],"capabilities":[]},
  "brand":{"version":"1","id":"demo","components":[
    {"ref":"demo.component.button","implementationId":"demo.android.button","props":[
      {"key":"title","type":"string","required":true,"bindable":true}
    ],"slots":[],"events":[{"name":"press"}]}
  ],"actions":[{"event":"button.press","actionType":"demo.action.press"}],"dataSources":[]},
  "document":{
    "version":"1",
    "id":"demo.concurrent",
    "recipeId":"demo.concurrent.recipe",
    "entryView":"main",
    "views":[{"id":"main","nodes":[
      {"id":"button","component":"demo.component.button","order":0,"props":{"title":"Main"}}
    ]}],
    "bindings":[],
    "interactions":[{"viewId":"main","nodeId":"button","event":"press","actionEvent":"button.press","routes":[]}]
  }
}
"""

private class SuspendedHostBridge : ViraAndroidHostBridge {
  override val version = "1"
  override val id = "demo.host.android"
  private var listener: ((ViraAndroidHostSnapshot) -> Unit)? = null
  private var pending: Continuation<ViraAndroidHostActionResult>? = null

  override fun snapshot() = ViraAndroidHostSnapshot(0, emptyMap(), emptyMap())

  override suspend fun dispatch(action: ViraAndroidHostActionDescriptor): ViraAndroidHostActionResult =
    suspendCoroutine { continuation ->
      check(pending == null)
      pending = continuation
    }

  override fun subscribe(listener: (ViraAndroidHostSnapshot) -> Unit): () -> Unit {
    this.listener = listener
    return { this.listener = null }
  }

  fun complete() {
    val continuation = pending ?: error("no suspended Host dispatch")
    pending = null
    continuation.resumeWith(Result.success(ViraAndroidHostActionResult(ViraAndroidHostActionOutcome.SUCCESS)))
  }
}

class RuntimeConcurrencyTests {
  @Test
  fun suspendedHostDispatchOwnsTheSingleActionSlotUntilCompletion() {
    val envelope = ViraAndroidMountEnvelope.decode(concurrentEnvelope).getOrThrow()
    val bridge = SuspendedHostBridge()
    val host = ViraAndroidHostAdapter.create(bridge).getOrThrow()
    val runtimeState = ViraAndroidRuntimeCoreState.decode(
      """{"experienceId":"demo-runtime","revision":0,"lifecycle":"active","plan":{"version":"1","id":"demo-plan","intent":{"version":"1","namespace":"demo","name":"test"},"state":{},"capabilities":{"required":[],"available":[],"future":[]}}}"""
    ).getOrThrow()
    val policy = ViraAndroidPermissionPolicy.create(listOf(
      ViraAndroidPermissionRule(
        ViraAndroidPermissionSubject.ACTION,
        "demo.action.press",
        ViraAndroidPermissionEffect.ALLOW,
      )
    )).getOrThrow()
    val session = ViraAndroidRuntimeSession(envelope, host, runtimeState, policy)

    val first = StartedSuspend {
      session.dispatch("button", "press")
    }
    assertTrue(first.isSuspended())

    val second = runSuspendConcurrency {
      session.dispatch("button", "press")
    }
    val issue = second.exceptionOrNull() as? ViraAndroidIssue
    assertEquals(ViraAndroidIssueCode.ACTION_PENDING, issue?.code)

    bridge.complete()
    val completion = first.await().getOrThrow()
    assertEquals(ViraAndroidHostActionOutcome.SUCCESS, completion.outcome)

    val third = runSuspendConcurrency {
      session.dispatch("button", "press")
    }
    assertTrue(third.isSuccess)
  }
}

private class StartedSuspend<T>(block: suspend () -> T) {
  private val latch = CountDownLatch(1)
  @Volatile private var value: Result<T>? = null

  init {
    block.startCoroutine(object : Continuation<T> {
      override val context = EmptyCoroutineContext
      override fun resumeWith(result: Result<T>) {
        value = result
        latch.countDown()
      }
    })
  }

  fun isSuspended(): Boolean = value == null

  fun await(): T {
    if (!latch.await(5, TimeUnit.SECONDS)) fail("suspend test timed out")
    return value!!.getOrThrow()
  }
}

private fun <T> runSuspendConcurrency(block: suspend () -> T): T {
  val latch = CountDownLatch(1)
  var result: Result<T>? = null
  block.startCoroutine(object : Continuation<T> {
    override val context = EmptyCoroutineContext
    override fun resumeWith(value: Result<T>) {
      result = value
      latch.countDown()
    }
  })
  if (!latch.await(5, TimeUnit.SECONDS)) fail("suspend test timed out")
  return result!!.getOrThrow()
}
