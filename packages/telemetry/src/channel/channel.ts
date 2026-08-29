import { createTelemetryEvent } from "../events/event.js";
import type { TelemetryEvent } from "../events/types.js";
import { createTelemetryExporterPort } from "../exporter/port.js";
import type {
  TelemetryExporterOperationResult,
  TelemetryExporterPortValidationIssue,
} from "../exporter/types.js";
import {
  TELEMETRY_CHANNEL_MAX_BATCH_SIZE,
  type TelemetryChannel,
  type TelemetryChannelOperation,
  type TelemetryChannelOperationResult,
  type TelemetryChannelResult,
  type TelemetryChannelState,
} from "./types.js";

type ActiveOperation = {
  readonly promise: Promise<TelemetryChannelOperationResult>;
};

const success = Object.freeze({ ok: true as const });

function closed(operation: TelemetryChannelOperation): TelemetryChannelOperationResult {
  return Object.freeze({ ok: false as const, code: "CHANNEL_CLOSED" as const, operation });
}

function busy(operation: TelemetryChannelOperation): TelemetryChannelOperationResult {
  return Object.freeze({ ok: false as const, code: "CHANNEL_BUSY" as const, operation });
}

function invalidBatch(): TelemetryChannelOperationResult {
  return Object.freeze({ ok: false as const, code: "INVALID_BATCH" as const, operation: "emit" as const });
}

function invalidExporter(): TelemetryChannelResult {
  const issue: TelemetryExporterPortValidationIssue = Object.freeze({
    code: "INVALID_EXPORTER",
    path: "$",
    message: "telemetry exporter must be a readable object or function-backed instance",
  });
  return { ok: false, issue };
}

function providerResult(result: TelemetryExporterOperationResult): TelemetryChannelOperationResult {
  if (result.ok) return success;
  return Object.freeze({
    ok: false as const,
    code: "PROVIDER_FAILURE" as const,
    operation: result.operation,
  });
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/u.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function normalizeBatch(input: unknown):
  | { readonly ok: true; readonly events: readonly TelemetryEvent[] }
  | { readonly ok: false; readonly result: TelemetryChannelOperationResult } {
  try {
    if (!Array.isArray(input)) return { ok: false, result: invalidBatch() };
    if (input.length === 0 || input.length > TELEMETRY_CHANNEL_MAX_BATCH_SIZE) {
      return { ok: false, result: invalidBatch() };
    }

    for (const key of Reflect.ownKeys(input)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !isCanonicalArrayIndex(key, input.length)) {
        return { ok: false, result: invalidBatch() };
      }
    }

    const events: TelemetryEvent[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !("value" in descriptor)) {
        return { ok: false, result: invalidBatch() };
      }

      const parsed = createTelemetryEvent(descriptor.value);
      if (!parsed.ok) {
        return {
          ok: false,
          result: Object.freeze({
            ok: false as const,
            code: "INVALID_EVENT" as const,
            operation: "emit" as const,
            index,
            issue: Object.freeze({ ...parsed.issue }),
          }),
        };
      }
      events.push(parsed.value);
    }

    return { ok: true, events: Object.freeze(events) };
  } catch {
    return { ok: false, result: invalidBatch() };
  }
}

export function createTelemetryChannel(exporterInput: unknown): TelemetryChannelResult {
  let createdExporter;
  try {
    createdExporter = createTelemetryExporterPort(exporterInput);
  } catch {
    return invalidExporter();
  }
  if (!createdExporter.ok) return createdExporter;

  const exporter = createdExporter.value;
  let state: TelemetryChannelState = "open";
  let active: ActiveOperation | undefined;
  let shutdownPromise: Promise<TelemetryChannelOperationResult> | undefined;

  function startSingleFlight(
    operation: Exclude<TelemetryChannelOperation, "shutdown">,
    task: () => Promise<TelemetryChannelOperationResult>,
  ): Promise<TelemetryChannelOperationResult> {
    if (state !== "open") return Promise.resolve(closed(operation));
    if (active) return Promise.resolve(busy(operation));

    const promise = task();
    const marker: ActiveOperation = { promise };
    active = marker;
    const clear = () => {
      if (active === marker) active = undefined;
    };
    void promise.then(clear, clear);
    return promise;
  }

  const channel: TelemetryChannel = Object.freeze({
    emit(event: unknown): Promise<TelemetryChannelOperationResult> {
      return channel.emitBatch([event]);
    },

    emitBatch(eventsInput: unknown): Promise<TelemetryChannelOperationResult> {
      if (state !== "open") return Promise.resolve(closed("emit"));
      if (active) return Promise.resolve(busy("emit"));

      const normalized = normalizeBatch(eventsInput);
      if (!normalized.ok) return Promise.resolve(normalized.result);

      return startSingleFlight("emit", async () => providerResult(await exporter.exportBatch(normalized.events)));
    },

    flush(): Promise<TelemetryChannelOperationResult> {
      return startSingleFlight("flush", async () => providerResult(await exporter.flush()));
    },

    shutdown(): Promise<TelemetryChannelOperationResult> {
      if (shutdownPromise) return shutdownPromise;
      if (state === "closed") return Promise.resolve(success);

      state = "closing";
      const activeAtShutdown = active?.promise;
      shutdownPromise = (async () => {
        if (activeAtShutdown) await activeAtShutdown;

        const flushResult = await exporter.flush();
        const shutdownResult = await exporter.shutdown();
        state = "closed";

        if (!flushResult.ok) return providerResult(flushResult);
        if (!shutdownResult.ok) return providerResult(shutdownResult);
        return success;
      })();
      return shutdownPromise;
    },

    getState(): TelemetryChannelState {
      return state;
    },
  });

  return { ok: true, value: channel };
}
