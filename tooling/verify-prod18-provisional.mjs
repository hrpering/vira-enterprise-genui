#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requirements = Object.freeze([
  {
    id: "external-host-identity",
    file: "packages/enterprise-context/src/external-host.ts",
    tokens: ["authorizeExternalHostContext", "HOST_AUDIENCE_MISMATCH", "DELEGATION_AUTHORIZATION_FAILED"],
  },
  {
    id: "cross-surface-continuity",
    file: "packages/cross-platform-conformance/src/continuity.ts",
    tokens: ["evaluateViraCrossSurfaceContinuity", "external-ai-host", "reconnected", "synchronized"],
  },
  {
    id: "external-ai-host-adapters",
    file: "packages/application-ai-host-sdk/src/external-adapter.ts",
    tokens: ["planViraExternalAiHostAdapter", "chatgpt", "copilot", "claude", "customer-agent", "PROJECTION_NOT_COMPATIBLE"],
  },
  {
    id: "ios-native-gate",
    file: "tooling/run-ios-simulator-gate.mjs",
    tokens: [],
  },
  {
    id: "android-native-gate",
    file: "tooling/run-android-emulator-gate.mjs",
    tokens: [],
  },
  {
    id: "external-ai-host-proof",
    file: "examples/external-ai-host-proof/external-ai-host-proof.test.ts",
    tokens: ["evaluateViraApplicationForAiHost"],
  },
]);

function fail(message, detail = {}) {
  process.stderr.write(`${JSON.stringify({
    version: "1",
    gate: "prod18-provisional",
    status: "INCOMPLETE",
    releaseAuthority: "forbidden",
    closureEligible: false,
    message,
    ...detail,
  }, null, 2)}\n`);
  process.exit(1);
}

const verified = [];
for (const requirement of requirements) {
  let source;
  try {
    source = readFileSync(path.join(root, requirement.file), "utf8");
  } catch {
    fail("required PROD-18 repository evidence is missing", { requirement: requirement.id, file: requirement.file });
  }
  const missingTokens = requirement.tokens.filter((token) => !source.includes(token));
  if (missingTokens.length > 0) {
    fail("required PROD-18 repository evidence drifted", {
      requirement: requirement.id,
      file: requirement.file,
      missingTokens,
    });
  }
  verified.push(requirement.id);
}

for (const file of [
  "docs/production/PROD18_EXTERNAL_HOST_IDENTITY.md",
  "docs/production/PROD18_CROSS_SURFACE_CONTINUITY.md",
  "docs/production/PROD18_EXTERNAL_AI_HOST_ADAPTERS.md",
]) {
  const source = readFileSync(path.join(root, file), "utf8");
  if (!/provisional/i.test(source) || /PROD-18 PRODUCTION READY|VIRA FULL PLATFORM RC/.test(source)) {
    fail("PROD-18 documentation release semantics drifted", { file });
  }
}

process.stdout.write(`${JSON.stringify({
  version: "1",
  gate: "prod18-provisional",
  status: "PROVISIONAL_CODE_COMPLETE",
  releaseAuthority: "forbidden",
  verified: Object.freeze(verified),
  liveEvidenceDeferred: Object.freeze([
    "production-device-matrix",
    "external-host-live-connectivity",
    "cross-device-recovery",
    "prod17-live-release-authority",
  ]),
  closureEligible: true,
}, null, 2)}\n`);
