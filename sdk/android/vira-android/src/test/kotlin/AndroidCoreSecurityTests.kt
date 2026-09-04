import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

private const val canonicalAndroidEnvelope = """
{
  "version":"1",
  "instanceId":"instance-android",
  "deploymentId":"deployment-android",
  "pack":{"id":"demo.pack","version":"1.0.0","entrypoint":"main"},
  "artifact":{"id":"main","role":"studio-publication","mediaType":"application/json","digest":"sha256-demo"},
  "compatibility":{"hostId":"demo.host.android","platform":"android"},
  "host":{"version":"1","id":"demo.host.android","platform":"android","implementationIds":["demo.android.button"],"capabilities":[]},
  "brand":{"version":"1","id":"demo","components":[
    {"ref":"demo.component.button","implementationId":"demo.android.button","props":[
      {"key":"title","type":"string","required":true,"bindable":true}
    ],"slots":[],"events":[{"name":"press"}]}
  ],"actions":[{"event":"button.press","actionType":"demo.action.press"}],"dataSources":[
    {"kind":"state","path":"catalog.title","valueType":"string"},
    {"kind":"domain","path":"catalog.items","valueType":"array"},
    {"kind":"scope","path":"currentItem.title","valueType":"string"}
  ]},
  "document":{
    "version":"1",
    "id":"demo.android",
    "recipeId":"demo.android.recipe",
    "entryView":"main",
    "views":[{"id":"main","nodes":[
      {"id":"button","component":"demo.component.button","order":0,"props":{"title":"Main"}}
    ]}],
    "bindings":[],
    "interactions":[{"viewId":"main","nodeId":"button","event":"press","actionEvent":"button.press","routes":[]}]
  }
}
"""

private fun runtimeState(lifecycle: String = "active"): ViraAndroidRuntimeCoreState =
  ViraAndroidRuntimeCoreState.decode(
    """
    {
      "experienceId":"demo-runtime",
      "revision":0,
      "lifecycle":"$lifecycle",
      "plan":{
        "version":"1",
        "id":"demo-plan",
        "intent":{"version":"1","namespace":"demo","name":"test"},
        "state":{"counter":0,"items":[]},
        "capabilities":{"required":[],"available":[],"future":[]}
      }
    }
    """.trimIndent()
  ).getOrThrow()

private fun allowPolicy(vararg ids: String): ViraAndroidPermissionPolicy =
  ViraAndroidPermissionPolicy.create(ids.map {
    ViraAndroidPermissionRule(ViraAndroidPermissionSubject.ACTION, it, ViraAndroidPermissionEffect.ALLOW)
  }).getOrThrow()

private class TestBridge(
  revision: Long = 0,
) : ViraAndroidHostBridge {
  override val version = "1"
  override val id = "demo.host.android"
  private var current = ViraAndroidHostSnapshot(revision, emptyMap(), emptyMap())
  private var listener: ((ViraAndroidHostSnapshot) -> Unit)? = null
  var dispatchCount = 0
  var resultSnapshot: ViraAndroidHostSnapshot? = null
  var outcome = ViraAndroidHostActionOutcome.SUCCESS

  override fun snapshot(): ViraAndroidHostSnapshot = current

  override suspend fun dispatch(action: ViraAndroidHostActionDescriptor): ViraAndroidHostActionResult {
    dispatchCount += 1
    return ViraAndroidHostActionResult(outcome, resultSnapshot)
  }

  override fun subscribe(listener: (ViraAndroidHostSnapshot) -> Unit): () -> Unit {
    this.listener = listener
    return { this.listener = null }
  }

  fun emit(snapshot: ViraAndroidHostSnapshot) {
    current = snapshot
    listener?.invoke(snapshot)
  }
}

private class TestLifecycleSource(
  private var current: ViraAndroidLifecycleSnapshot = ViraAndroidLifecycleSnapshot(
    ViraAndroidSessionVisibility.FOREGROUND,
    ViraAndroidSessionConnectivity.CONNECTED,
  ),
) : ViraAndroidLifecycleSource {
  private var listener: ((ViraAndroidLifecycleEvent) -> Unit)? = null
  override fun snapshot() = current
  override fun subscribe(listener: (ViraAndroidLifecycleEvent) -> Unit): () -> Unit {
    this.listener = listener
    return { this.listener = null }
  }
  fun emit(type: ViraAndroidLifecycleEventType) { listener?.invoke(ViraAndroidLifecycleEvent(type = type)) }
}

class AndroidCoreSecurityTests {
  @Test
  fun canonicalEnvelopeDecodesAndForgedSourcesFailClosed() {
    val envelope = ViraAndroidMountEnvelope.decode(canonicalAndroidEnvelope).getOrThrow()
    assertEquals("android", envelope.compatibility.platform)
    assertEquals("demo.android.button", envelope.brand.components.single().implementationId)

    val forged = canonicalAndroidEnvelope
      .replace("\"props\":{\"title\":\"Main\"}", "\"props\":{}")
      .replace("\"bindings\":[]", "\"bindings\":[{\"viewId\":\"main\",\"nodeId\":\"button\",\"prop\":\"title\",\"source\":{\"kind\":\"state\",\"path\":\"catalog.secret\"}}]")
    val failure = ViraAndroidMountEnvelope.decode(forged).exceptionOrNull() as? ViraAndroidIssue
    assertEquals(ViraAndroidIssueCode.INVALID_ENVELOPE, failure?.code)
  }

  @Test
  fun canonicalJsonRejectsProgrammaticNonFiniteHostValues() {
    val bridge = TestBridge()
    bridge.emit(ViraAndroidHostSnapshot(1, mapOf("bad" to ViraJson.Num(Double.NaN)), emptyMap()))
    val adapter = ViraAndroidHostAdapter.create(bridge)
    assertTrue(adapter.isFailure)
  }

  @Test
  fun permissionPolicyDefaultsToDenyAndAcceptsCanonicalSingleSegmentIds() {
    val policy = ViraAndroidPermissionPolicy.create(listOf(
      ViraAndroidPermissionRule(ViraAndroidPermissionSubject.CAPABILITY, "select-date", ViraAndroidPermissionEffect.ALLOW)
    )).getOrThrow()
    assertEquals(ViraAndroidPermissionEffect.ALLOW, policy.effect(ViraAndroidPermissionSubject.CAPABILITY, "select-date"))
    assertEquals(ViraAndroidPermissionEffect.DENY, policy.effect(ViraAndroidPermissionSubject.ACTION, "unknown"))
  }

  @Test
  fun duplicateHostSnapshotRevisionIsDeterministicNoOp() {
    val bridge = TestBridge(revision = 1)
    val adapter = ViraAndroidHostAdapter.create(bridge).getOrThrow()
    var callbacks = 0
    adapter.subscribe { callbacks += 1 }
    bridge.emit(ViraAndroidHostSnapshot(1, mapOf("ignored" to ViraJson.Bool(true)), emptyMap()))
    assertEquals(0, callbacks)
    assertEquals(emptyMap<String, ViraJson>(), adapter.snapshot().getOrThrow().state)
  }

  @Test
  fun staleDispatchSnapshotDoesNotPoisonNewerSubscriptionState() {
    val bridge = TestBridge(revision = 1)
    val adapter = ViraAndroidHostAdapter.create(bridge).getOrThrow()
    bridge.emit(ViraAndroidHostSnapshot(2, mapOf("ready" to ViraJson.Bool(true)), emptyMap()))
    bridge.resultSnapshot = ViraAndroidHostSnapshot(1, emptyMap(), emptyMap())

    val dispatch = runSuspend {
      adapter.dispatch(ViraAndroidHostActionDescriptor("submit", emptyMap()))
    }
    assertTrue(dispatch.isFailure)
    assertEquals(2, adapter.snapshot().getOrThrow().revision)
    assertEquals(ViraJson.Bool(true), adapter.snapshot().getOrThrow().state["ready"])
  }

  @Test
  fun subscriptionRevisionRegressionPoisonsAdapterFailClosed() {
    val bridge = TestBridge(revision = 2)
    val adapter = ViraAndroidHostAdapter.create(bridge).getOrThrow()
    bridge.emit(ViraAndroidHostSnapshot(1, emptyMap(), emptyMap()))
    val issue = adapter.snapshot().exceptionOrNull() as? ViraAndroidIssue
    assertEquals(ViraAndroidIssueCode.STALE_SNAPSHOT, issue?.code)
  }

  @Test
  fun runtimeCoreBuiltinsReduceLocallyAndOrdinaryRuntimePrefixUsesHostPath() {
    val core = ViraAndroidRuntimeCoreSession(runtimeState())
    val patch = ViraJson.Obj(mapOf(
      "version" to ViraJson.Str("1"),
      "operations" to ViraJson.Arr(listOf(ViraJson.Obj(mapOf(
        "op" to ViraJson.Str("set"),
        "path" to ViraJson.Str("/state/counter"),
        "value" to ViraJson.Num(1.0),
      )))),
    ))
    assertFalse(core.process("runtime.patch.apply", mapOf("patch" to patch), ViraAndroidPermissionEffect.ALLOW).getOrThrow())
    assertEquals(1, core.state().revision)
    assertFalse(core.process("runtime.lifecycle.transition", mapOf("target" to ViraJson.Str("updating")), ViraAndroidPermissionEffect.ALLOW).getOrThrow())
    assertEquals(ViraAndroidRuntimeCoreLifecycle.UPDATING, core.state().lifecycle)
    assertTrue(core.process("runtime.custom.action", emptyMap(), ViraAndroidPermissionEffect.ALLOW).getOrThrow())
  }

  @Test
  fun malformedRuntimePatchFailsBeforeHostOwnership() {
    val core = ViraAndroidRuntimeCoreSession(runtimeState())
    val result = core.process(
      "runtime.patch.apply",
      mapOf("patch" to ViraJson.Obj(mapOf("version" to ViraJson.Str("1")))),
      ViraAndroidPermissionEffect.ALLOW,
    )
    val issue = result.exceptionOrNull() as? ViraAndroidIssue
    assertEquals(ViraAndroidIssueCode.RUNTIME_REDUCTION_FAILED, issue?.code)
    assertEquals(0, core.state().revision)
  }

  @Test
  fun sessionRestoreIsExactInstanceBoundAndVerificationRequired() {
    val source = TestLifecycleSource()
    val controller = ViraAndroidSessionController.create("instance-a", source).getOrThrow()
    source.emit(ViraAndroidLifecycleEventType.BACKGROUND)
    val persisted = controller.state().getOrThrow()
    val restored = ViraAndroidSessionController.restore("instance-a", persisted, TestLifecycleSource()).getOrThrow()
    assertEquals(ViraAndroidSessionContinuity.RESTORED, restored.state().getOrThrow().continuity)
    assertEquals(ViraAndroidSessionCacheStatus.VERIFICATION_REQUIRED, restored.state().getOrThrow().cacheStatus)
    assertTrue(ViraAndroidSessionController.restore("instance-b", persisted, TestLifecycleSource()).isFailure)
  }

  @Test
  fun duplicateLifecycleSignalIsNoOpAndInstancesAreIsolated() {
    val sourceA = TestLifecycleSource()
    val sourceB = TestLifecycleSource()
    val a = ViraAndroidSessionController.create("instance-a", sourceA).getOrThrow()
    val b = ViraAndroidSessionController.create("instance-b", sourceB).getOrThrow()
    sourceA.emit(ViraAndroidLifecycleEventType.BACKGROUND)
    assertEquals(1, a.state().getOrThrow().revision)
    assertEquals(0, b.state().getOrThrow().revision)
    sourceA.emit(ViraAndroidLifecycleEventType.BACKGROUND)
    assertEquals(1, a.state().getOrThrow().revision)
  }
}

private fun <T> runSuspend(block: suspend () -> T): T {
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
