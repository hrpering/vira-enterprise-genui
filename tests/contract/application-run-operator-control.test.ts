import { describe, expect, it } from "vitest";
import {
  createViraApplicationRunOperatorControlService,
  createViraApplicationRunService,
  type ViraApplicationRun,
  type ViraApplicationRunOperatorControlAuthorizationInput,
  type ViraApplicationRunStore,
  type ViraApplicationRunStoreMutationResult,
} from "../../packages/application-runtime/src/index.js";
import { createViraEnterpriseGovernancePipeline } from "../../packages/enterprise-governance/src/index.js";

const scope = {
  version: "1",
  organizationId: "org-demo",
  projectId: "project-demo",
  environment: "staging",
} as const;
const entrypointRef = { id: "travel.flight.booking-flow", versionRef: "1" } as const;
const distributionDigest = "a".repeat(64);
const resolutionDigest = "b".repeat(64);

function resolution() {
  return {
    artifact: {
      release: { id: "vira.flight-assistant", version: "1.2.0" },
      environment: "staging",
      deploymentId: "deployment:flight:7",
      deploymentRevision: 7,
      artifactId: "application-artifact:flight:1.2.0",
      distributionDigest,
      distribution: {
        integrity: { algorithm: "sha256", digest: distributionDigest },
        application: {
          identity: { id: "vira.flight-assistant" },
          version: "1.2.0",
          flows: [entrypointRef],
        },
      },
      binding: { scope },
    },
    canonicalArtifact: "{canonical-resolution-artifact}",
    resolutionDigest,
  };
}

function memoryStore(): ViraApplicationRunStore & { records: Map<string, ViraApplicationRun> } {
  const records = new Map<string, ViraApplicationRun>();
  const key = (itemScope: typeof scope, id: string) =>
    `${itemScope.organizationId}/${itemScope.projectId}/${itemScope.environment}/${id}`;
  return {
    records,
    async read(itemScope, id) {
      return records.get(key(itemScope as typeof scope, id));
    },
    async create(run): Promise<ViraApplicationRunStoreMutationResult> {
      const itemKey = key(run.scope as typeof scope, run.id);
      if (records.has(itemKey)) return { ok: false, code: "ALREADY_EXISTS" };
      records.set(itemKey, run);
      return { ok: true, value: run };
    },
    async replace(run, expectedRevision): Promise<ViraApplicationRunStoreMutationResult> {
      const itemKey = key(run.scope as typeof scope, run.id);
      const current = records.get(itemKey);
      if (!current) return { ok: false, code: "NOT_FOUND" };
      if (current.revision !== expectedRevision) return { ok: false, code: "VERSION_CONFLICT" };
      records.set(itemKey, run);
      return { ok: true, value: run };
    },
  };
}

function harness(authorize: (input: ViraApplicationRunOperatorControlAuthorizationInput) => Promise<boolean> | boolean) {
  let now = 1_900_000_000_000;
  const store = memoryStore();
  const run = createViraApplicationRunService({ store, nowUnixMs: () => now });
  const control = createViraApplicationRunOperatorControlService({ store, nowUnixMs: () => now, authorize });
  if (!run.ok) throw new Error(run.issue.message);
  if (!control.ok) throw new Error(control.issue.message);
  return {
    store,
    run: run.value,
    control: control.value,
    setNow(value: number) { now = value; },
  };
}

async function createRun(runtime: ReturnType<typeof harness>, id: string) {
  const created = await runtime.run.create({ id, scope, resolution: resolution(), entrypointRef, workContextId: null });
  if (!created.ok) throw new Error(created.issue.message);
  return created.value;
}

function governanceAuthorizer() {
  const pipeline = createViraEnterpriseGovernancePipeline({
    scope,
    principals: [{ version: "1", kind: "user", id: "operator-1", organizationId: scope.organizationId }],
    providers: [{
      version: "1",
      id: "policy.operator-control",
      evaluate(context) {
        const operator = context.enterprisePrincipals.some((principal) =>
          principal.kind === "user" && principal.id === "operator-1");
        const operation = context.governance.actionIntent.action.type;
        const allowed = operator && (operation === "application.run.pause" || operation === "application.run.resume");
        return {
          version: "1",
          effect: allowed ? "allow" : "deny",
          reasonCode: allowed ? "operator.allowed" : "operator.denied",
          obligations: [],
          provider: "policy.operator-control",
        };
      },
    }],
    allowedObligations: [],
  });
  if (!pipeline.ok) throw new Error(pipeline.issue.message);

  return async (input: ViraApplicationRunOperatorControlAuthorizationInput): Promise<boolean> => {
    const evaluated = await pipeline.value.evaluate({
      coreSafety: { version: "1", effect: "allow", reasonCode: "runtime.control.safe" },
      context: {
        version: "1",
        instanceId: input.run.id,
        experienceId: input.run.resolution.release.id,
        experienceVersion: input.run.resolution.release.version,
        platform: "web",
        actionIntent: {
          version: "1",
          instanceId: input.run.id,
          expectedStateRevision: input.expectedRevision,
          idempotencyKey: `operator.${input.operation}.${input.expectedRevision}`,
          action: {
            id: `control.${input.operation}.${input.expectedRevision}`,
            type: `application.run.${input.operation}`,
            source: "user",
            payload: { runId: input.run.id },
          },
        },
      },
    });
    return evaluated.ok;
  };
}

describe("PROD-08 ApplicationRun operator controls", () => {
  it("requires an explicit authorizer before operator controls exist", () => {
    const store = memoryStore();
    const created = createViraApplicationRunOperatorControlService({
      store,
      nowUnixMs: () => 1_900_000_000_000,
    } as never);
    expect(created).toMatchObject({ ok: false, issue: { code: "INVALID_SERVICE" } });
    expect(store.records.size).toBe(0);
  });

  it("fails closed when authorization denies or throws without mutating the run", async () => {
    for (const authorize of [
      () => false,
      () => { throw new Error("policy unavailable"); },
    ]) {
      const runtime = harness(authorize);
      const created = await createRun(runtime, `run.denied.${runtime.store.records.size}`);
      const result = await runtime.control.pause({ scope, id: created.id, expectedRevision: 1 });
      expect(result).toMatchObject({ ok: false, issue: { code: "AUTHORIZATION_DENIED" } });
      expect(await runtime.run.read(scope, created.id)).toMatchObject({
        ok: true,
        value: { revision: 1, status: "running", wait: null },
      });
    }
  });

  it("pauses and operator-resumes a running run with revision-safe exactly-once transitions", async () => {
    const runtime = harness(() => true);
    const created = await createRun(runtime, "run.operator.running");
    runtime.setNow(1_900_000_000_100);

    const paused = await runtime.control.pause({ scope, id: created.id, expectedRevision: 1 });
    expect(paused).toMatchObject({ ok: true, value: { revision: 2, status: "paused", wait: null } });
    expect(paused.ok && paused.value.resolution).toEqual(created.resolution);

    expect(await runtime.control.pause({ scope, id: created.id, expectedRevision: 1 })).toMatchObject({
      ok: false,
      issue: { code: "CONFLICT", path: "$.expectedRevision" },
    });

    runtime.setNow(1_900_000_000_200);
    const resumed = await runtime.control.resumePaused({ scope, id: created.id, expectedRevision: 2 });
    expect(resumed).toMatchObject({ ok: true, value: { revision: 3, status: "running", wait: null } });
    expect(resumed.ok && resumed.value.resolution).toEqual(created.resolution);

    expect(await runtime.control.resumePaused({ scope, id: created.id, expectedRevision: 2 })).toMatchObject({
      ok: false,
      issue: { code: "CONFLICT", path: "$.expectedRevision" },
    });
  });

  it("preserves an exact wait while paused and restores waiting rather than inventing execution", async () => {
    const runtime = harness(() => true);
    const created = await createRun(runtime, "run.operator.waiting");
    const waiting = await runtime.run.wait({
      scope,
      id: created.id,
      expectedRevision: 1,
      wait: { id: "wait.operator.001", kind: "event", reference: "event:operator:001", dueAtUnixMs: null },
    });
    if (!waiting.ok) throw new Error(waiting.issue.message);

    const paused = await runtime.control.pause({ scope, id: created.id, expectedRevision: 2 });
    expect(paused).toMatchObject({
      ok: true,
      value: { revision: 3, status: "paused", wait: waiting.value.wait },
    });
    expect(paused.ok && paused.value.resolution).toEqual(created.resolution);

    const resumed = await runtime.control.resumePaused({ scope, id: created.id, expectedRevision: 3 });
    expect(resumed).toMatchObject({
      ok: true,
      value: { revision: 4, status: "waiting", wait: waiting.value.wait },
    });
    expect(resumed.ok && resumed.value.resolution).toEqual(created.resolution);
  });

  it("denies invalid lifecycle transitions after authorization and preserves terminal state", async () => {
    const runtime = harness(() => true);
    const running = await createRun(runtime, "run.operator.invalid-running");
    expect(await runtime.control.resumePaused({ scope, id: running.id, expectedRevision: 1 })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_STATE", path: "$.status" },
    });

    for (const status of ["completed", "failed"] as const) {
      const created = await createRun(runtime, `run.operator.${status}`);
      const terminal: ViraApplicationRun = Object.freeze({
        ...created,
        revision: 2,
        status,
        updatedAtUnixMs: created.updatedAtUnixMs + 1,
      });
      const stored = await runtime.store.replace(terminal, 1);
      if (!stored.ok) throw new Error(stored.code);
      expect(await runtime.control.pause({ scope, id: created.id, expectedRevision: 2 })).toMatchObject({
        ok: false,
        issue: { code: "INVALID_STATE", path: "$.status" },
      });
      expect(await runtime.run.read(scope, created.id)).toMatchObject({
        ok: true,
        value: { revision: 2, status },
      });
    }
  });

  it("captures canonical run identity and revision before an async authorization boundary", async () => {
    let captured: ViraApplicationRunOperatorControlAuthorizationInput | undefined;
    let enteredResolve: (() => void) | undefined;
    let authorizationResolve: ((value: boolean) => void) | undefined;
    const entered = new Promise<void>((resolve) => { enteredResolve = resolve; });
    const runtime = harness(async (input) => {
      captured = input;
      enteredResolve?.();
      return new Promise<boolean>((resolve) => { authorizationResolve = resolve; });
    });
    const created = await createRun(runtime, "run.operator.snapshot");
    const request = { scope: { ...scope }, id: created.id, expectedRevision: 1 };
    const pending = runtime.control.pause(request);
    await entered;

    request.id = "run.attacker";
    request.expectedRevision = 999;
    authorizationResolve?.(true);

    const result = await pending;
    expect(captured).toMatchObject({
      version: "1",
      operation: "pause",
      expectedRevision: 1,
      run: { id: created.id, scope, revision: 1, status: "running" },
    });
    expect(result).toMatchObject({ ok: true, value: { id: created.id, revision: 2, status: "paused" } });
  });

  it("keeps cross-scope and malformed requests fail-closed without mutation", async () => {
    const runtime = harness(() => true);
    const created = await createRun(runtime, "run.operator.scope");
    const otherScope = { ...scope, organizationId: "org-other" };

    expect(await runtime.control.pause({ scope: otherScope, id: created.id, expectedRevision: 1 })).toMatchObject({
      ok: false,
      issue: { code: "NOT_FOUND" },
    });
    expect(await runtime.control.pause({ scope, id: "", expectedRevision: 1 })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });
    expect(await runtime.run.read(scope, created.id)).toMatchObject({
      ok: true,
      value: { revision: 1, status: "running" },
    });
  });

  it("composes with the canonical enterprise-governance pipeline without adding a runtime dependency on it", async () => {
    const runtime = harness(governanceAuthorizer());
    const created = await createRun(runtime, "run.operator.governed");

    const paused = await runtime.control.pause({ scope, id: created.id, expectedRevision: 1 });
    expect(paused).toMatchObject({ ok: true, value: { revision: 2, status: "paused" } });
    const resumed = await runtime.control.resumePaused({ scope, id: created.id, expectedRevision: 2 });
    expect(resumed).toMatchObject({ ok: true, value: { revision: 3, status: "running" } });
  });
});
