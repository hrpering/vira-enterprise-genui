import type { TelemetryEventValidationIssue } from "../events/types.js";
import type {
  TelemetryExporterOperation,
  TelemetryExporterPortValidationIssue,
} from "../exporter/types.js";

export const TELEMETRY_CHANNEL_MAX_BATCH_SIZE = 256 as const;

export type TelemetryChannelState = "open" | "closing" | "closed";
export type TelemetryChannelOperation = "emit" | "flush" | "shutdown";

export type TelemetryChannelOperationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "CHANNEL_CLOSED" | "CHANNEL_BUSY";
      readonly operation: TelemetryChannelOperation;
    }
  | {
      readonly ok: false;
      readonly code: "INVALID_BATCH";
      readonly operation: "emit";
    }
  | {
      readonly ok: false;
      readonly code: "INVALID_EVENT";
      readonly operation: "emit";
      readonly index: number;
      readonly issue: TelemetryEventValidationIssue;
    }
  | {
      readonly ok: false;
      readonly code: "PROVIDER_FAILURE";
      readonly operation: TelemetryExporterOperation;
    };

export interface TelemetryChannel {
  emit(event: unknown): Promise<TelemetryChannelOperationResult>;
  emitBatch(events: unknown): Promise<TelemetryChannelOperationResult>;
  flush(): Promise<TelemetryChannelOperationResult>;
  shutdown(): Promise<TelemetryChannelOperationResult>;
  getState(): TelemetryChannelState;
}

export type TelemetryChannelResult =
  | { readonly ok: true; readonly value: TelemetryChannel }
  | { readonly ok: false; readonly issue: TelemetryExporterPortValidationIssue };
