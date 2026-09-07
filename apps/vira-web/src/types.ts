export type Role = "operator" | "builder" | "admin";
export type SurfaceState = "ready" | "loading" | "empty" | "partial" | "error" | "uncertain" | "degraded" | "offline" | "reconnecting";
export type Tone = "neutral" | "positive" | "warning" | "negative" | "info";

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly group: "workspace" | "operations" | "build" | "admin";
  readonly roles: readonly Role[];
  readonly badge?: number;
}

export interface EvidenceStep {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly timestamp: string;
  readonly tone: Tone;
  readonly ref: string;
}

export interface RunSummary {
  readonly id: string;
  readonly application: string;
  readonly intent: string;
  readonly status: "running" | "waiting" | "completed" | "uncertain";
  readonly startedAt: string;
  readonly actor: string;
  readonly evidence: readonly EvidenceStep[];
}
