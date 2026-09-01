import { describe, expect, it } from "vitest";
import type { TelemetryEvent } from "../../packages/telemetry/src/index.js";
import { createTelemetryChannel } from "../../packages/telemetry/src/index.js";
import { createExperienceObservation } from "../../packages/experience-observability/src/index.js";

describe("Experience Observability telemetry channel integration", () => {
  it("emits the canonical mapped event through the existing telemetry channel without an observability-specific transport", async () => {
    const batches: TelemetryEvent[][] = [];
    const created = createTelemetryChannel({
      async exportBatch(events: readonly TelemetryEvent[]) {
        batches.push([...events]);
      },
      async flush() {},
      async shutdown() {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const observation = createExperienceObservation({
      name: "experience.render.completed",
      source: "runtime-web",
      occurredAt: "2026-09-01T02:30:00.000Z",
    });
    expect(observation.ok).toBe(true);
    if (!observation.ok) return;

    await expect(created.value.emit(observation.value)).resolves.toEqual({ ok: true });
    expect(batches).toEqual([[observation.value]]);
    await expect(created.value.shutdown()).resolves.toEqual({ ok: true });
  });
});
