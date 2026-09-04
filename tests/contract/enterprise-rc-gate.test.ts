import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "vitest";

const externalProofVerifier = fileURLToPath(
  new URL("../../tooling/verify-external-brand-proof-evidence.mjs", import.meta.url),
);
const enterpriseRcGate = fileURLToPath(
  new URL("../../tooling/verify-enterprise-rc.mjs", import.meta.url),
);

function git(repo: string, args: string[]) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function createGitRepo() {
  const repo = mkdtempSync(join(tmpdir(), "vira-enterprise-rc-"));
  git(repo, ["init", "--quiet"]);
  writeFileSync(join(repo, "marker.txt"), "release-gate\n", "utf8");
  git(repo, ["add", "marker.txt"]);
  git(repo, [
    "-c", "user.name=Vira Test",
    "-c", "user.email=vira-test@example.invalid",
    "-c", "commit.gpgsign=false",
    "commit", "--quiet", "-m", "test fixture",
  ]);
  return { repo, head: git(repo, ["rev-parse", "HEAD"]) };
}

function validEvidence(head: string) {
  return {
    version: "1",
    viraHead: head,
    pack: {
      id: "example.brand",
      version: "1.0.0",
      digest: `sha256:${"a".repeat(64)}`,
    },
    platforms: {
      web: { passed: true, traceRef: "trace:web" },
      ios: { passed: true, traceRef: "trace:ios" },
      android: { passed: true, traceRef: "trace:android" },
    },
    gates: {
      samePackIdentity: true,
      actionBoundary: true,
      governanceApproval: true,
      observabilityLedger: true,
      crossPlatformConformance: true,
      accessibilityLocalization: true,
      crossTenantDenied: true,
      wrongPackVersionDenied: true,
      unknownComponentDenied: true,
      unknownActionDenied: true,
      unsignedArtifactDenied: true,
      staleRevisionDenied: true,
      duplicateRetryDenied: true,
      reconnectCacheVerified: true,
    },
  };
}

function runExternalVerifier(repo: string, evidence?: unknown) {
  const env = { ...process.env };
  if (evidence === undefined) {
    delete env.VIRA_EXTERNAL_BRAND_PROOF_EVIDENCE;
  } else {
    const path = join(repo, "external-brand-proof.json");
    writeFileSync(path, JSON.stringify(evidence), "utf8");
    env.VIRA_EXTERNAL_BRAND_PROOF_EVIDENCE = path;
  }
  return spawnSync(process.execPath, [externalProofVerifier], {
    cwd: repo,
    env,
    encoding: "utf8",
  });
}

function createFakePnpm(root: string) {
  const bin = join(root, "bin");
  const fake = join(bin, "pnpm-fake.cjs");
  const pnpm = join(bin, process.platform === "win32" ? "pnpm.cmd" : "pnpm");
  const mkdir = spawnSync(process.execPath, ["-e", `require("node:fs").mkdirSync(${JSON.stringify(bin)}, { recursive: true })`]);
  assert.equal(mkdir.status, 0);

  writeFileSync(fake, [
    'const fs = require("node:fs");',
    'const command = process.argv[2] ?? "";',
    'fs.appendFileSync(process.env.VIRA_RC_TEST_LOG, `${command}\\n`);',
    'if (process.env.VIRA_RC_TEST_FAIL === command) process.exit(Number(process.env.VIRA_RC_TEST_FAIL_CODE ?? "9"));',
  ].join("\n"), "utf8");

  if (process.platform === "win32") {
    writeFileSync(pnpm, `@echo off\r\n"${process.execPath}" "%~dp0\\pnpm-fake.cjs" %*\r\n`, "utf8");
  } else {
    writeFileSync(pnpm, '#!/usr/bin/env node\nrequire("./pnpm-fake.cjs");\n', "utf8");
    chmodSync(pnpm, 0o755);
  }
  return bin;
}

test("external brand proof verifier accepts one exact valid proof bound to current HEAD", () => {
  const { repo, head } = createGitRepo();
  try {
    const result = runExternalVerifier(repo, validEvidence(head));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /External brand proof evidence verified/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("external brand proof verifier fails closed when evidence is missing", () => {
  const { repo } = createGitRepo();
  try {
    const result = runExternalVerifier(repo);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /VIRA_EXTERNAL_BRAND_PROOF_EVIDENCE must point to external brand proof evidence JSON/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("external brand proof verifier rejects stale HEAD, missing gates, and failed platforms", () => {
  const { repo, head } = createGitRepo();
  try {
    const stale = validEvidence("0".repeat(40));
    const staleResult = runExternalVerifier(repo, stale);
    assert.notEqual(staleResult.status, 0);
    assert.match(staleResult.stderr, /targets 0000000000000000000000000000000000000000, but current checkout is/);

    const missingGateEvidence = validEvidence(head);
    const missingGateEntries = Object.entries(missingGateEvidence.gates)
      .filter(([key]) => key !== "duplicateRetryDenied");
    const missingGateResult = runExternalVerifier(repo, {
      ...missingGateEvidence,
      gates: Object.fromEntries(missingGateEntries),
    });
    assert.notEqual(missingGateResult.status, 0);
    assert.match(missingGateResult.stderr, /invalid external brand proof evidence: gate set/);

    const failedPlatform = validEvidence(head);
    failedPlatform.platforms.ios.passed = false;
    const failedPlatformResult = runExternalVerifier(repo, failedPlatform);
    assert.notEqual(failedPlatformResult.status, 0);
    assert.match(failedPlatformResult.stderr, /invalid external brand proof evidence: ios did not pass/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("Enterprise RC gate invokes every required stage in canonical order before PASS", () => {
  const root = mkdtempSync(join(tmpdir(), "vira-enterprise-rc-order-"));
  try {
    const bin = createFakePnpm(root);
    const log = join(root, "commands.log");
    const result = spawnSync(process.execPath, [enterpriseRcGate], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        VIRA_RC_TEST_LOG: log,
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), [
      "verify:all",
      "check:studio-native",
      "verify:ios-simulator",
      "verify:android-emulator",
      "verify:external-brand-proof",
    ]);
    assert.match(result.stdout, /Vira Enterprise RC gate PASS on the exact current checkout\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Enterprise RC gate stops at the first failed stage and never prints PASS", () => {
  const root = mkdtempSync(join(tmpdir(), "vira-enterprise-rc-fail-fast-"));
  try {
    const bin = createFakePnpm(root);
    const log = join(root, "commands.log");
    const result = spawnSync(process.execPath, [enterpriseRcGate], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        VIRA_RC_TEST_LOG: log,
        VIRA_RC_TEST_FAIL: "verify:ios-simulator",
        VIRA_RC_TEST_FAIL_CODE: "7",
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 7);
    assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), [
      "verify:all",
      "check:studio-native",
      "verify:ios-simulator",
    ]);
    assert.match(result.stderr, /iOS Simulator gate failed with exit code 7/);
    assert.doesNotMatch(result.stdout, /Vira Enterprise RC gate PASS/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
