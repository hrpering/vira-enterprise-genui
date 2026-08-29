import type { TelemetryEvent } from "../events/types.js";

export type TelemetryExporterOperation = "export" | "flush" | "shutdown";

export type TelemetryExporterOperationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "PROVIDER_FAILURE";
      readonly operation: TelemetryExporterOperation;
    };

export interface TelemetryExporterPort {
  exportBatch(events: readonly TelemetryEvent[]): Promise<TelemetryExporterOperationResult>;
  flush(): Promise<TelemetryExporterOperationResult>;
  shutdown(): Promise<TelemetryExporterOperationResult>;
}

export type TelemetryExporterPortValidationCode =
  | "INVALID_EXPORTER"
  | "INVALID_EXPORT_METHOD"
  | "INVALID_FLUSH_METHOD"
  | "INVALID_SHUTDOWN_METHOD";

export interface TelemetryExporterPortValidationIssue {
  readonly code: TelemetryExporterPortValidationCode;
  readonly path: string;
  readonly message: string;
}

export type TelemetryExporterPortResult =
  | { readonly ok: true; readonly value: TelemetryExporterPort }
  | { readonly ok: false; readonly issue: TelemetryExporterPortValidationIssue };
