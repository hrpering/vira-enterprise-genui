import { spawnSync } from "node:child_process";
import process from "node:process";

const EXPECTED_BRANCH = "prod/12-durable-execution-fencing-outbox-private-runner";
const SUPPORTED_FLAGS = new Set(["--full", "--browser", "--live-db", "--ios", "--android"]);
const rawArgs = process.argv.slice(2);
for (const arg of rawArgs) {
  if (!SUPPORTED_FLAGS.has(arg)) {
    process.stderr.write(`Unsupported PROD-12 local gate flag: ${arg}\n`);
    process.exit(2);
  }
}

const args = new Set(rawArgs);
const full = args.has("--full");
const includeBrowser = full || args.has("--browser");
const includeLiveDb = full || args.has("--live-db");
const includeIos = full || args.has("--ios");
const includeAndroid = full || args.has("--android");

function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.error !== undefined || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr ?? result.stdout ?? "unknown error";
    throw new Error(`${command} ${commandArgs.join(" ")} failed: ${String(detail).trim()}`);
  }
  return result.stdout.trim();
}

function readGitState() {
  return Object.freeze({
    headSha: capture("git", ["rev-parse", "HEAD"]),
    branch: capture("git", ["branch", "--show-current"]),
    dirty: capture("git", ["status", "--porcelain"]),
  });
}

let initialGit;
try {
  initialGit = readGitState();
} catch (error) {
  process.stderr.write(`PROD-12 local gate cannot establish exact git state: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

if (!/^[a-f0-9]{40}$/.test(initialGit.headSha)) {
  process.stderr.write(`PROD-12 local gate received invalid git HEAD: ${initialGit.headSha}\n`);
  process.exit(1);
}
if (initialGit.branch !== EXPECTED_BRANCH) {
  process.stderr.write(`PROD-12 local gate requires branch ${EXPECTED_BRANCH}; current branch is ${initialGit.branch || "<detached>"}.\n`);
  process.exit(1);
}
if (initialGit.dirty.length > 0) {
  process.stderr.write("PROD-12 local gate requires a clean working tree. Commit or discard local changes first.\n");
  process.stderr.write(`${initialGit.dirty}\n`);
  process.exit(1);
}

const steps = [
  ["durable restart / recovery", "verify:durable-restart"],
  ["worker fencing / composition", "verify:worker-fencing"],
  ["transactional outbox", "verify:transaction-outbox"],
  ["private runner", "verify:private-runner"],
  ["PostgreSQL durable execution", "verify:durable-execution-postgres"],
  ["full repository verification", "verify"],
];

if (includeLiveDb) steps.push(["production PostgreSQL live", "verify:production-db"]);
if (includeBrowser) steps.push(["browser E2E", "verify:browser"]);
if (includeIos) steps.push(["iOS simulator", "verify:ios-simulator"]);
if (includeAndroid) steps.push(["Android emulator", "verify:android-emulator"]);

const evidence = [];
const startedAt = new Date().toISOString();

for (const [label, script] of steps) {
  process.stdout.write(`\n=== PROD-12 LOCAL GATE: ${label} (${script}) ===\n`);
  const started = Date.now();
  const result = spawnSync("pnpm", [script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  const durationMs = Date.now() - started;
  const status = result.status ?? 1;
  evidence.push({ label, script, status, durationMs });
  if (result.error !== undefined) {
    process.stderr.write(`PROD-12 local gate could not launch ${script}: ${result.error.message}\n`);
    process.exitCode = 1;
    break;
  }
  if (status !== 0) {
    process.stderr.write(`PROD-12 local gate FAILED at ${script} (exit ${status}).\n`);
    process.exitCode = status;
    break;
  }
}

let finalGit;
let gitStateStable = false;
try {
  finalGit = readGitState();
  gitStateStable = finalGit.headSha === initialGit.headSha
    && finalGit.branch === initialGit.branch
    && finalGit.dirty.length === 0;
} catch (error) {
  finalGit = Object.freeze({ headSha: "<unavailable>", branch: "<unavailable>", dirty: "<unavailable>" });
  process.stderr.write(`PROD-12 local gate cannot revalidate final git state: ${error instanceof Error ? error.message : String(error)}\n`);
}

if (!gitStateStable) {
  process.stderr.write("PROD-12 local gate git state changed during verification; evidence is not exact-head safe.\n");
  process.exitCode = 1;
}

const scriptsPassed = evidence.length === steps.length && evidence.every((entry) => entry.status === 0);
const passed = scriptsPassed && gitStateStable;
const closureEligible = passed && includeLiveDb && includeBrowser && includeIos && includeAndroid;
process.stdout.write(`\n${JSON.stringify({
  event: "vira.prod12.local-verification",
  headSha: initialGit.headSha,
  finalHeadSha: finalGit.headSha,
  branch: initialGit.branch,
  finalBranch: finalGit.branch,
  workingTreeClean: initialGit.dirty.length === 0 && finalGit.dirty.length === 0,
  gitStateStable,
  startedAt,
  finishedAt: new Date().toISOString(),
  passed,
  closureEligible,
  flags: {
    full,
    browser: includeBrowser,
    liveDb: includeLiveDb,
    ios: includeIos,
    android: includeAndroid,
  },
  evidence,
}, null, 2)}\n`);

if (!passed && process.exitCode === undefined) process.exitCode = 1;
