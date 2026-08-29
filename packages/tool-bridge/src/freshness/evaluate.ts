import { parseExternalToolResult } from "../validate.js";
import type {
  ToolFreshnessEvaluation,
  ToolFreshnessEvaluationResult,
  ToolFreshnessEvaluationValidationCode,
} from "./types.js";

function failure(
  code: ToolFreshnessEvaluationValidationCode,
  path: string,
  message: string,
): ToolFreshnessEvaluationResult {
  return { ok: false, issue: { code, path, message } };
}

function validUnixMs(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

export function evaluateToolResultFreshness(
  resultInput: unknown,
  nowUnixMs: unknown,
): ToolFreshnessEvaluationResult {
  if (!validUnixMs(nowUnixMs)) {
    return failure(
      "INVALID_NOW",
      "$.nowUnixMs",
      "nowUnixMs must be a non-negative safe integer supplied by the caller",
    );
  }

  const result = parseExternalToolResult(resultInput);
  if (!result.ok) {
    return failure(
      "INVALID_TOOL_RESULT",
      nestedPath("$.result", result.issue.path),
      "external tool result is invalid",
    );
  }

  const freshness = result.value.freshness;
  if (!freshness) {
    return {
      ok: true,
      value: Object.freeze({
        status: "unknown",
        nowUnixMs,
      } satisfies ToolFreshnessEvaluation),
    };
  }

  if (nowUnixMs < freshness.observedAtUnixMs) {
    return {
      ok: true,
      value: Object.freeze({
        status: "future",
        nowUnixMs,
        observedAtUnixMs: freshness.observedAtUnixMs,
        ...(freshness.expiresAtUnixMs === undefined ? {} : { expiresAtUnixMs: freshness.expiresAtUnixMs }),
      } satisfies ToolFreshnessEvaluation),
    };
  }

  if (freshness.expiresAtUnixMs !== undefined && nowUnixMs >= freshness.expiresAtUnixMs) {
    return {
      ok: true,
      value: Object.freeze({
        status: "stale",
        nowUnixMs,
        observedAtUnixMs: freshness.observedAtUnixMs,
        expiresAtUnixMs: freshness.expiresAtUnixMs,
      } satisfies ToolFreshnessEvaluation),
    };
  }

  return {
    ok: true,
    value: Object.freeze({
      status: "fresh",
      nowUnixMs,
      observedAtUnixMs: freshness.observedAtUnixMs,
      ...(freshness.expiresAtUnixMs === undefined ? {} : { expiresAtUnixMs: freshness.expiresAtUnixMs }),
    } satisfies ToolFreshnessEvaluation),
  };
}
