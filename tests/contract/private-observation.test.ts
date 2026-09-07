import { describe, expect, it } from "vitest";
import type { ViraEnterpriseScope } from "../../packages/enterprise-context/src/index.js";
import {
  runViraPrivateObservation,
  type ViraPrivateObservationAuthority,
} from "../../packages/private-runner/src/observation.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

const SECRET = "prod13-readback-secret-0123456789";

function authority(): ViraPrivateObservationAuthority {
  return {
    version: "1",
    authorityId: "verification.prod13.readback",
    scope,
    providerId: "github",
    connectionId: "github.connection",
    actionIntent: { version: "1", kind: "github.repository.file.update", owner: "demo", repo: "repo", path: "README.md", branch: "main", message: "update", contentBase64: "bmV3" },
    secretRef: {
      version: "1",
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      environment: scope.environment,
      provider: "vault",
      key: "providers.github",
      versionRef: "1",
    },
    expiresAtEpochMs: NOW + 120_000,
  };
}

function resolved(overrides: Partial<{
  scope: ViraEnterpriseScope;
  secretRef: ViraPrivateObservationAuthority["secretRef"];
  credential: string;
  expiresAtEpochMs: number;
}> = {}) {
  const target = authority();
  return {
    scope: overrides.scope ?? target.scope,
    secretRef: overrides.secretRef ?? target.secretRef,
    credential: overrides.credential ?? SECRET,
    expiresAtEpochMs: overrides.expiresAtEpochMs ?? NOW + 60_000,
  };
}

describe("PROD-13 Private Observation", () => {
  it("resolves exact scoped credential and returns only secret-free canonical observation data", async () => {
    let seenCredential: string | undefined;
    const result = await runViraPrivateObservation({
      authority: authority(),
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { return resolved(); } },
      adapter: {
        observe(input) {
          seenCredential = input.credential;
          return { observation: { providerId: "github", resourceId: "github.repository.file:abc" } };
        },
      },
    });
    expect(seenCredential).toBe(SECRET);
    expect(result).toMatchObject({ ok: true, value: { version: "1" } });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("rejects cross-scope and substituted SecretRef evidence before observation adapter invocation", async () => {
    let calls = 0;
    const adapter = { observe() { calls += 1; return { observation: {} }; } };
    const otherScope: ViraEnterpriseScope = { ...scope, projectId: "project-other" };
    const otherRef = { ...authority().secretRef, projectId: "project-other" };
    expect(await runViraPrivateObservation({
      authority: authority(),
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { return resolved({ scope: otherScope, secretRef: otherRef }); } },
      adapter,
    })).toMatchObject({ ok: false, issue: { code: "SECRET_SCOPE_MISMATCH" } });
    expect(await runViraPrivateObservation({
      authority: authority(),
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { return resolved({ secretRef: { ...authority().secretRef, key: "providers.attacker" } }); } },
      adapter,
    })).toMatchObject({ ok: false, issue: { code: "SECRET_SCOPE_MISMATCH" } });
    expect(calls).toBe(0);
  });

  it("rejects expired readback authority before secret resolution", async () => {
    let secretCalls = 0;
    expect(await runViraPrivateObservation({
      authority: { ...authority(), expiresAtEpochMs: NOW + 1 },
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { secretCalls += 1; return resolved(); } },
      adapter: { observe() { return { observation: {} }; } },
    })).toMatchObject({ ok: false, issue: { code: "AUTHORITY_EXPIRED" } });
    expect(secretCalls).toBe(0);
  });

  it("blocks credential exfiltration from observation evidence", async () => {
    expect(await runViraPrivateObservation({
      authority: authority(),
      nowEpochMs: NOW + 1,
      secretProvider: { resolve() { return resolved(); } },
      adapter: { observe() { return { observation: { debug: `Bearer ${SECRET}` } }; } },
    })).toMatchObject({ ok: false, issue: { code: "SECRET_EXFILTRATION" } });
  });

  it("snapshots authority before awaiting secret resolution", async () => {
    let entered!: () => void;
    let release!: () => void;
    const gateEntered = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const mutable = structuredClone(authority()) as ViraPrivateObservationAuthority & {
      providerId: string;
      actionIntent: { owner: string };
    };
    let observedProvider: string | undefined;

    const pending = runViraPrivateObservation({
      authority: mutable,
      nowEpochMs: NOW + 1,
      secretProvider: {
        async resolve() {
          entered();
          await gate;
          return resolved();
        },
      },
      adapter: {
        observe(input) {
          observedProvider = input.authority.providerId;
          return { observation: { providerId: input.authority.providerId } };
        },
      },
    });

    await gateEntered;
    mutable.providerId = "attacker";
    mutable.actionIntent.owner = "attacker";
    release();
    expect(await pending).toMatchObject({ ok: true });
    expect(observedProvider).toBe("github");
  });
});
