import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const EVIDENCE_VERSION = "1";
const requiredPlatformKeys = ["web", "ios", "android"];
const requiredGateKeys = [
  "samePackIdentity",
  "actionBoundary",
  "governanceApproval",
  "observabilityLedger",
  "crossPlatformConformance",
  "accessibilityLocalization",
  "crossTenantDenied",
  "wrongPackVersionDenied",
  "unknownComponentDenied",
  "unknownActionDenied",
  "unsignedArtifactDenied",
  "staleRevisionDenied",
  "duplicateRetryDenied",
  "reconnectCacheVerified",
];
const HEAD = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,511}$/;

function plain(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(object, keys) {
  return plain(object)
    && Object.keys(object).sort().join("\0") === [...keys].sort().join("\0");
}

function fail(message) {
  throw new Error(`invalid Pegasus proof evidence: ${message}`);
}

const configured = process.env.VIRA_PEGASUS_PROOF_EVIDENCE;
if (!configured) {
  throw new Error("VIRA_PEGASUS_PROOF_EVIDENCE must point to the external Pegasus proof evidence JSON");
}
const path = resolve(configured);
let evidence;
try {
  evidence = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
  throw new Error(
    `Pegasus proof evidence could not be read from ${path}: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error },
  );
}

if (!exact(evidence, ["version", "viraHead", "pack", "platforms", "gates"])) fail("root shape");
if (evidence.version !== EVIDENCE_VERSION) fail("version");
if (typeof evidence.viraHead !== "string" || !HEAD.test(evidence.viraHead)) fail("viraHead");
if (!exact(evidence.pack, ["id", "version", "digest"])) fail("pack shape");
if (typeof evidence.pack.id !== "string" || !REF.test(evidence.pack.id)) fail("pack id");
if (typeof evidence.pack.version !== "string" || !REF.test(evidence.pack.version)) fail("pack version");
if (typeof evidence.pack.digest !== "string" || !DIGEST.test(evidence.pack.digest)) fail("pack digest");

if (!exact(evidence.platforms, requiredPlatformKeys)) fail("platform set");
for (const platform of requiredPlatformKeys) {
  const record = evidence.platforms[platform];
  if (!exact(record, ["passed", "traceRef"])) fail(`${platform} evidence shape`);
  if (record.passed !== true) fail(`${platform} did not pass`);
  if (typeof record.traceRef !== "string" || !REF.test(record.traceRef)) fail(`${platform} traceRef`);
}

if (!exact(evidence.gates, requiredGateKeys)) fail("gate set");
for (const key of requiredGateKeys) {
  if (evidence.gates[key] !== true) fail(`${key} must be true`);
}

const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
if (git.error || git.status !== 0) throw new Error("git rev-parse HEAD failed while verifying Pegasus proof evidence");
const currentHead = git.stdout.trim();
if (currentHead !== evidence.viraHead) {
  throw new Error(`Pegasus proof evidence targets ${evidence.viraHead}, but current checkout is ${currentHead}`);
}

console.log(`Pegasus proof evidence verified for ${evidence.pack.id}@${evidence.pack.version} (${evidence.pack.digest})`);