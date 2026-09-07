import { describe, expect, it } from "vitest";
import type { ViraDurableExecutionStageBPermit } from "../../packages/durable-execution/src/index.js";
import type { ViraEnterpriseScope } from "../../packages/enterprise-context/src/index.js";
import { runViraPrivateExecution } from "../../packages/private-runner/src/index.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

const SECRET = "prod12-secret-value-0123456789";

function permit(): ViraDurableExecutionStageBPermit {
  return {
    version: "1",
    executionId: "execution.prod12.001",
    scope,
    transactionId: "transaction.demo.publish",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "publish.document",
    actionRef: { id: "demo.document.publish", versionRef: "1.0.0" },
    actionIntent: { resource: { id: "doc-42" }, amount: 1200 },
    providerId: "demo",
    connectionId: "demo.connection",
    adapterRef: "adapter.demo",
    runnerRef: "runner.private",
    secretRef: {
      version: "1",
      organizationId: "org-demo",
      projectId: "project-demo",
      environment: "staging",
      provider: "vault",
      key: "providers.demo",
      versionRef: "7",
    },
    idempotencyKey: "tx-demo:publish.document",
    grantId: "grant.prod12.001",
    grantNonce: "nonce.prod12.001",
    reservationId: "reservation:execution.prod12.001:1",
    reservationRevision: 3,
    workerId: "worker.prod12.a",
    leaseEpoch: 1,
    expiresAtEpochMs: NOW + 30_000,
  };
}

function resolved(overrides: Partial<{
  scope: ViraEnterpriseScope;
  secretRef: ViraDurableExecutionStageBPermit["secretRef"];
  credential: string;
  expiresAtEpochMs: number;
}> = {}) {
  const target = permit();
  return {
    scope: overrides.scope ?? scope,
    secretRef: overrides.secretRef ?? target.secretRef,
    credential: overrides.credential ?? SECRET,
    expiresAtEpochMs: overrides.expiresAtEpochMs ?? NOW + 20_000,
  };
}

describe("PROD-12 Private Runner", () => {
  it("resolves exact scoped credential and exposes only secret-free dispatch evidence", async () => {
    let adapterCredential: string | undefined;
    const result = await runViraPrivateExecution({
      permit: permit(),
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { return resolved(); } },
      adapter: {
        invoke(input) {
          adapterCredential = input.credential;
          expect(input.permit.secretRef.key).toBe("providers.demo");
          return { dispatch: "accepted", data: { requestId: "provider-request-42" } };
        },
      },
    });
    expect(adapterCredential).toBe(SECRET);
    expect(result).toMatchObject({
      ok: true,
      value: { version: "1", dispatch: "accepted", data: { requestId: "provider-request-42" } },
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("rejects cross-scope or substituted secret evidence before adapter invocation", async () => {
    let adapterCalls = 0;
    const adapter = { invoke() { adapterCalls += 1; return { dispatch: "accepted" }; } };
    const otherScope: ViraEnterpriseScope = { ...scope, projectId: "project-other" };
    const otherSecretRef = { ...permit().secretRef, projectId: "project-other" };

    expect(await runViraPrivateExecution({
      permit: permit(),
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { return resolved({ scope: otherScope, secretRef: otherSecretRef }); } },
      adapter,
    })).toMatchObject({ ok: false, issue: { code: "SECRET_SCOPE_MISMATCH" } });

    expect(await runViraPrivateExecution({
      permit: permit(),
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { return resolved({ secretRef: { ...permit().secretRef, key: "providers.attacker" } }); } },
      adapter,
    })).toMatchObject({ ok: false, issue: { code: "SECRET_SCOPE_MISMATCH" } });
    expect(adapterCalls).toBe(0);
  });

  it("rejects credential lifetime that exceeds the Stage B permit", async () => {
    let adapterCalls = 0;
    expect(await runViraPrivateExecution({
      permit: permit(),
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { return resolved({ expiresAtEpochMs: NOW + 40_000 }); } },
      adapter: { invoke() { adapterCalls += 1; return { dispatch: "accepted" }; } },
    })).toMatchObject({ ok: false, issue: { code: "SECRET_EXPIRED" } });
    expect(adapterCalls).toBe(0);
  });

  it("blocks credential exfiltration in canonical adapter results", async () => {
    expect(await runViraPrivateExecution({
      permit: permit(),
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { return resolved(); } },
      adapter: { invoke() { return { dispatch: "accepted", data: { debug: `token=${SECRET}` } }; } },
    })).toMatchObject({ ok: false, issue: { code: "SECRET_EXFILTRATION" } });
  });

  it("does not echo provider or adapter exception messages", async () => {
    const secretFailure = await runViraPrivateExecution({
      permit: permit(),
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { throw new Error(`secret manager leaked ${SECRET}`); } },
      adapter: { invoke() { return { dispatch: "accepted" }; } },
    });
    expect(secretFailure).toMatchObject({ ok: false, issue: { code: "SECRET_RESOLUTION_FAILED" } });
    expect(JSON.stringify(secretFailure)).not.toContain(SECRET);

    const adapterFailure = await runViraPrivateExecution({
      permit: permit(),
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { return resolved(); } },
      adapter: { invoke() { throw new Error(`provider may have accepted ${SECRET}`); } },
    });
    expect(adapterFailure).toMatchObject({ ok: false, issue: { code: "ADAPTER_UNCERTAIN" } });
    expect(JSON.stringify(adapterFailure)).not.toContain(SECRET);
  });

  it("rejects an expired Stage B permit before resolving any secret", async () => {
    let secretCalls = 0;
    expect(await runViraPrivateExecution({
      permit: { ...permit(), expiresAtEpochMs: NOW + 1 },
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { secretCalls += 1; return resolved(); } },
      adapter: { invoke() { return { dispatch: "accepted" }; } },
    })).toMatchObject({ ok: false, issue: { code: "PERMIT_EXPIRED" } });
    expect(secretCalls).toBe(0);
  });

  it("snapshots permit and adapter dependency before awaiting secret resolution", async () => {
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const mutablePermit = structuredClone(permit()) as ViraDurableExecutionStageBPermit & {
      operationId: string;
      adapterRef: string;
      actionIntent: { resource: { id: string }; amount: number };
    };
    let observedOperation: string | undefined;
    let observedAdapter: string | undefined;

    const pending = runViraPrivateExecution({
      permit: mutablePermit,
      nowEpochMs: NOW + 1,
      secretProvider: {
        async resolve() {
          enter();
          await gate;
          return resolved();
        },
      },
      adapter: {
        invoke(input) {
          observedOperation = input.permit.operationId;
          observedAdapter = input.permit.adapterRef;
          return { dispatch: "accepted" };
        },
      },
    });

    await entered;
    mutablePermit.operationId = "delete.document";
    mutablePermit.adapterRef = "adapter.attacker";
    mutablePermit.actionIntent.resource.id = "doc-attacker";
    release();

    expect(await pending).toMatchObject({ ok: true });
    expect(observedOperation).toBe("publish.document");
    expect(observedAdapter).toBe("adapter.demo");
  });
});
