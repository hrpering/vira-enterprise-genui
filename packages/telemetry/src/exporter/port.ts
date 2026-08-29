import type { TelemetryEvent } from "../events/types.js";
import type {
  TelemetryExporterOperation,
  TelemetryExporterOperationResult,
  TelemetryExporterPort,
  TelemetryExporterPortResult,
  TelemetryExporterPortValidationCode,
} from "./types.js";

type DataMethod = (...args: unknown[]) => unknown;

const success = Object.freeze({ ok: true as const });
const TRUSTED_METHOD_PROTOTYPE_DEPTH_LIMIT = 64;

function failure(
  code: TelemetryExporterPortValidationCode,
  path: string,
  message: string,
): TelemetryExporterPortResult {
  return { ok: false, issue: { code, path, message } };
}

function operationFailure(operation: TelemetryExporterOperation): TelemetryExporterOperationResult {
  return Object.freeze({ ok: false as const, code: "PROVIDER_FAILURE" as const, operation });
}

function findDataMethod(value: object, name: string): DataMethod | undefined {
  const visited = new Set<object>();
  let current: object | null = value;
  let depth = 0;

  try {
    while (
      current !== null
      && current !== Object.prototype
      && current !== Function.prototype
    ) {
      if (visited.has(current) || depth >= TRUSTED_METHOD_PROTOTYPE_DEPTH_LIMIT) return undefined;
      visited.add(current);
      depth += 1;

      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (descriptor) {
        if (!("value" in descriptor) || typeof descriptor.value !== "function") return undefined;
        return descriptor.value as DataMethod;
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function invoke(
  input: unknown,
  method: DataMethod,
  operation: TelemetryExporterOperation,
  args: readonly unknown[] = [],
): Promise<TelemetryExporterOperationResult> {
  try {
    await method.call(input, ...args);
    return success;
  } catch {
    return operationFailure(operation);
  }
}

export function createTelemetryExporterPort(input: unknown): TelemetryExporterPortResult {
  if (input === null || (typeof input !== "object" && typeof input !== "function")) {
    return failure("INVALID_EXPORTER", "$", "telemetry exporter must be an object or function-backed instance");
  }

  const exporterObject = input as object;
  const exportBatch = findDataMethod(exporterObject, "exportBatch");
  if (!exportBatch) {
    return failure("INVALID_EXPORT_METHOD", "$.exportBatch", "telemetry exporter must provide an exportBatch data method");
  }

  const flush = findDataMethod(exporterObject, "flush");
  if (!flush) {
    return failure("INVALID_FLUSH_METHOD", "$.flush", "telemetry exporter must provide a flush data method");
  }

  const shutdown = findDataMethod(exporterObject, "shutdown");
  if (!shutdown) {
    return failure("INVALID_SHUTDOWN_METHOD", "$.shutdown", "telemetry exporter must provide a shutdown data method");
  }

  const port: TelemetryExporterPort = Object.freeze({
    exportBatch(events: readonly TelemetryEvent[]): Promise<TelemetryExporterOperationResult> {
      return invoke(input, exportBatch, "export", [events]);
    },
    flush(): Promise<TelemetryExporterOperationResult> {
      return invoke(input, flush, "flush");
    },
    shutdown(): Promise<TelemetryExporterOperationResult> {
      return invoke(input, shutdown, "shutdown");
    },
  });

  return { ok: true, value: port };
}
