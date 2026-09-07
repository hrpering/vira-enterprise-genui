import { describe, expect, it } from "vitest";
import {
  evaluateViraCrossSurfaceContinuity,
  type ViraCrossSurfaceAuthoritySnapshot,
} from "../../packages/cross-platform-conformance/src/continuity.js";

const authority: ViraCrossSurfaceAuthoritySnapshot = Object.freeze({
  applicationReleaseRef: "demo.application@1.2.3",
  scopeRef: "org-demo/project-demo/staging",
  run: Object.freeze({ id: "run.demo.001", revision: 12 }),
  task: Object.freeze({ id: "task.demo.001", revision: 4 }),
  approval: Object.freeze({ id: "approval.demo.001", planDigest: "a".repeat(64), planRevision: 3, decision: "approved" }),
  artifact: Object.freeze({ id: "artifact.demo.001", revision: 8, digest: `sha256:${"b".repeat(64)}` }),
});

function observation(surface: "web" | "ios" | "android" | "external-ai-host", connectivity: "online" | "offline" | "reconnected", state = authority) {
  return { version: "1", surface, connectivity, state } as const;
}

describe("PROD-18 cross-surface continuity evidence", () => {
  it("proves exact Run, Task, Approval and Artifact continuity across web, native and external AI host surfaces", () => {
    const result = evaluateViraCrossSurfaceContinuity({
      fixtureId: "continuity.demo.001",
      authority,
      observations: [
        observation("web", "online"),
        observation("ios", "online"),
        observation("android", "online"),
        observation("external-ai-host", "online"),
      ],
    });
    expect(result).toMatchObject({ ok: true, value: { conformant: true } });
    if (!result.ok) return;
    expect(result.value.observations.every((item) => item.synchronized)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("treats an offline stale native snapshot as visible drift instead of silently upgrading it", () => {
    const stale = { ...authority, run: { ...authority.run, revision: 11 }, task: { ...authority.task!, revision: 3 } };
    const result = evaluateViraCrossSurfaceContinuity({
      fixtureId: "continuity.demo.offline",
      authority,
      observations: [observation("ios", "offline", stale)],
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        conformant: false,
        observations: [{ surface: "ios", connectivity: "offline", synchronized: false }],
      },
    });
    if (!result.ok) return;
    expect(result.value.observations[0]?.mismatches.map((item) => item.path)).toEqual(["$.state.run", "$.state.task"]);
  });

  it("requires a reconnected surface to converge back to exact authority", () => {
    const staleArtifact = { ...authority, artifact: { ...authority.artifact!, revision: 7 } };
    const stale = evaluateViraCrossSurfaceContinuity({
      fixtureId: "continuity.demo.reconnect-stale",
      authority,
      observations: [observation("android", "reconnected", staleArtifact)],
    });
    expect(stale).toMatchObject({ ok: true, value: { conformant: false } });

    const converged = evaluateViraCrossSurfaceContinuity({
      fixtureId: "continuity.demo.reconnect-ok",
      authority,
      observations: [observation("android", "reconnected")],
    });
    expect(converged).toMatchObject({ ok: true, value: { conformant: true } });
  });

  it("detects wrong-tenant and wrong-application replay on an external AI host", () => {
    const replay = {
      ...authority,
      applicationReleaseRef: "other.application@1.2.3",
      scopeRef: "org-other/project-demo/staging",
    };
    const result = evaluateViraCrossSurfaceContinuity({
      fixtureId: "continuity.demo.host-replay",
      authority,
      observations: [observation("external-ai-host", "online", replay)],
    });
    expect(result).toMatchObject({ ok: true, value: { conformant: false } });
    if (!result.ok) return;
    expect(result.value.observations[0]?.mismatches.map((item) => item.path)).toEqual([
      "$.state.applicationReleaseRef",
      "$.state.scopeRef",
    ]);
  });

  it("detects stale approval meaning even when the approval id stays the same", () => {
    const staleApproval = {
      ...authority,
      approval: { ...authority.approval!, planRevision: 2, planDigest: "c".repeat(64) },
    };
    const result = evaluateViraCrossSurfaceContinuity({
      fixtureId: "continuity.demo.approval",
      authority,
      observations: [observation("web", "online", staleApproval)],
    });
    expect(result).toMatchObject({ ok: true, value: { conformant: false } });
    if (!result.ok) return;
    expect(result.value.observations[0]?.mismatches[0]?.path).toBe("$.state.approval");
  });

  it("rejects duplicate surfaces and secret-like or floating extra authority fields structurally", () => {
    expect(evaluateViraCrossSurfaceContinuity({
      fixtureId: "continuity.demo.duplicate",
      authority,
      observations: [observation("web", "online"), observation("web", "online")],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_SURFACE" } });

    expect(evaluateViraCrossSurfaceContinuity({
      fixtureId: "continuity.demo.secret",
      authority: { ...authority, token: "never" },
      observations: [observation("web", "online")],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });
  });
});
