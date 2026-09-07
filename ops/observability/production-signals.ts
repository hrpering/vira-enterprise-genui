export const VIRA_PRODUCTION_SIGNALS = Object.freeze({
  metrics: Object.freeze([
    "vira_http_request_duration_ms",
    "vira_run_terminal_outcome_total",
    "vira_transaction_uncertain_total",
    "vira_outbox_oldest_pending_seconds",
    "vira_webhook_replay_rejected_total",
    "vira_billing_export_revision_total",
  ]),
  requiredLabels: Object.freeze(["service", "environment", "region", "outcome"]),
  forbiddenLabels: Object.freeze(["user_id", "email", "session_token", "authorization"]),
  alerts: Object.freeze([
    Object.freeze({ id: "api-error-budget-fast-burn", severity: "page", runbook: "production-shell", expression: "http_5xx_ratio > 0.05 for 5m" }),
    Object.freeze({ id: "durable-outbox-stalled", severity: "page", runbook: "postgres-production", expression: "oldest_pending_seconds > 300 for 10m" }),
    Object.freeze({ id: "uncertain-transaction-spike", severity: "ticket", runbook: "protected-transaction-recovery", expression: "uncertain_total > 5 for 15m" }),
  ]),
});
