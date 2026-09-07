#!/usr/bin/env node

const OWNER = process.env.VIRA_GITHUB_OWNER ?? "hrpering";
const REPO = process.env.VIRA_GITHUB_REPO ?? "vira-enterprise-genui";
const BRANCH = process.env.VIRA_GITHUB_BRANCH ?? "main";
const REQUIRED_CHECKS = ["verify", "ios-native", "android-native"];
const token = process.env.VIRA_GITHUB_ADMIN_READ_TOKEN ?? process.env.GITHUB_TOKEN;

function fail(message, detail = {}) {
  const output = {
    version: "1",
    gate: "main-governance",
    authority: "live-github-api",
    repository: `${OWNER}/${REPO}`,
    branch: BRANCH,
    requiredChecks: REQUIRED_CHECKS,
    closureEligible: false,
    message,
    ...detail,
  };
  process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(1);
}

if (!token) {
  fail("GitHub admin-read token is required", {
    requiredEnvironment: ["VIRA_GITHUB_ADMIN_READ_TOKEN"],
  });
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "vira-enterprise-genui-governance-verifier",
};

async function getJson(path) {
  const response = await globalThis.fetch(`https://api.github.com${path}`, { headers });
  const text = await response.text();
  let body;
  try {
    body = text.length === 0 ? null : JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    fail("GitHub governance truth could not be read", {
      httpStatus: response.status,
      endpoint: path,
      githubMessage: typeof body?.message === "string" ? body.message : undefined,
    });
  }
  return body;
}

function namesFromStatusChecks(requiredStatusChecks) {
  const checks = Array.isArray(requiredStatusChecks?.checks)
    ? requiredStatusChecks.checks.map((entry) => entry?.context).filter(Boolean)
    : [];
  const contexts = Array.isArray(requiredStatusChecks?.contexts)
    ? requiredStatusChecks.contexts.filter(Boolean)
    : [];
  return [...new Set([...checks, ...contexts])].sort();
}

function allowanceNames(value) {
  if (!value || typeof value !== "object") return [];
  const kinds = ["users", "teams", "apps"];
  return kinds.flatMap((kind) =>
    Array.isArray(value[kind])
      ? value[kind].map((entry) => `${kind}:${entry?.slug ?? entry?.login ?? entry?.name ?? entry?.id ?? "unknown"}`)
      : [],
  );
}

const protection = await getJson(
  `/repos/${encodeURIComponent(OWNER)}/${encodeURIComponent(REPO)}/branches/${encodeURIComponent(BRANCH)}/protection`,
);

const requiredPullRequestReviews = protection.required_pull_request_reviews;
if (!requiredPullRequestReviews) {
  fail("main is not PR-only: required_pull_request_reviews is absent");
}

const checks = namesFromStatusChecks(protection.required_status_checks);
const missingChecks = REQUIRED_CHECKS.filter((name) => !checks.includes(name));
if (missingChecks.length > 0) {
  fail("required status checks are incomplete", { checksObserved: checks, missingChecks });
}

const bypass = allowanceNames(requiredPullRequestReviews.bypass_pull_request_allowances);
if (bypass.length > 0) {
  fail("pull-request bypass allowances are configured", { bypassAllowances: bypass });
}

if (protection.allow_force_pushes?.enabled === true) {
  fail("force pushes are enabled on main");
}
if (protection.allow_deletions?.enabled === true) {
  fail("branch deletion is enabled on main");
}

const strictStatusChecks = protection.required_status_checks?.strict === true;
if (!strictStatusChecks) {
  fail("required status checks are not strict/up-to-date before merge", { checksObserved: checks });
}

const output = {
  version: "1",
  gate: "main-governance",
  authority: "live-github-api",
  repository: `${OWNER}/${REPO}`,
  branch: BRANCH,
  prOnly: true,
  strictStatusChecks: true,
  requiredChecks: REQUIRED_CHECKS,
  checksObserved: checks,
  bypassAllowances: [],
  forcePushes: false,
  deletions: false,
  closureEligible: true,
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
