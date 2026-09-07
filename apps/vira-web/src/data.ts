import type { EvidenceStep, NavigationItem, RunSummary } from "./types.js";

export const navigation: readonly NavigationItem[] = Object.freeze([
  { id: "chat", label: "Chat", group: "workspace", roles: ["operator", "builder", "admin"] },
  { id: "applications", label: "Applications", group: "workspace", roles: ["operator", "builder", "admin"] },
  { id: "runs", label: "Runs", group: "operations", roles: ["operator", "builder", "admin"], badge: 3 },
  { id: "artifacts", label: "Artifacts", group: "operations", roles: ["operator", "builder", "admin"] },
  { id: "tasks", label: "Tasks", group: "operations", roles: ["operator", "builder", "admin"], badge: 5 },
  { id: "approvals", label: "Approvals", group: "operations", roles: ["operator", "admin"], badge: 2 },
  { id: "waiting", label: "Waiting", group: "operations", roles: ["operator", "builder", "admin"] },
  { id: "attention", label: "Needs attention", group: "operations", roles: ["operator", "builder", "admin"], badge: 1 },
  { id: "audit", label: "Audit", group: "operations", roles: ["operator", "admin"] },
  { id: "billing", label: "Usage & billing", group: "operations", roles: ["operator", "admin"] },
  { id: "studio", label: "Studio", group: "build", roles: ["builder", "admin"] },
  { id: "flow", label: "Flow", group: "build", roles: ["builder", "admin"] },
  { id: "integrations", label: "Integrations", group: "build", roles: ["builder", "admin"] },
  { id: "connections", label: "Connections", group: "build", roles: ["builder", "admin"] },
  { id: "releases", label: "Publish & releases", group: "admin", roles: ["admin"] },
  { id: "health", label: "Health", group: "admin", roles: ["admin"] },
  { id: "diagnostics", label: "Diagnostics", group: "admin", roles: ["admin"] },
  { id: "recovery", label: "Recovery", group: "admin", roles: ["admin"] },
]);

export const activeRun: RunSummary = Object.freeze({
  id: "run_01J8X4NQ7B2M",
  application: "Governed Employee Offboarding",
  intent: "Remove repository and calendar access for Alex Morgan",
  status: "waiting",
  startedAt: "14:32:08",
  actor: "Maya Chen",
  evidence: Object.freeze([
    { id: "e1", label: "Intent accepted", detail: "Application release and tenant scope pinned", timestamp: "14:32:08", tone: "positive", ref: "apprel_4f29…c18a" },
    { id: "e2", label: "GitHub query verified", detail: "Team and repository memberships read", timestamp: "14:32:10", tone: "positive", ref: "obs_87b2…12fe" },
    { id: "e3", label: "Transaction prepared", detail: "3 protected actions, exact postconditions", timestamp: "14:32:11", tone: "positive", ref: "txnplan_07ad…56b0" },
    { id: "e4", label: "Approval required", detail: "Repository admin removal is protected", timestamp: "14:32:12", tone: "warning", ref: "approval_a019…b881" },
    { id: "e5", label: "Execution waiting", detail: "No provider mutation has been attempted", timestamp: "Now", tone: "neutral", ref: "wait_0f12…8d43" },
  ] satisfies readonly EvidenceStep[]),
});

export const recentRuns: readonly RunSummary[] = Object.freeze([
  activeRun,
  { ...activeRun, id: "run_01J8X2AW9H1K", intent: "Archive contractor workspace access", status: "completed", startedAt: "13:48:21", actor: "Jon Bell", evidence: [] },
  { ...activeRun, id: "run_01J8WZP8CZ7T", intent: "Revoke stale integration token", status: "uncertain", startedAt: "12:05:44", actor: "Policy trigger", evidence: [] },
]);
