import { spawnSync } from "node:child_process";

const VIRA_IOS_SCHEME = "ViraIOS";

function command(name, args, options = {}) {
  const result = spawnSync(name, args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr ?? result.stdout ?? "unknown failure";
    throw new Error(`${name} ${args.join(" ")} failed: ${String(detail).trim()}`);
  }
  return result.stdout;
}

function findSchemes(value) {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => findSchemes(item));
  }
  if (Array.isArray(value.schemes)) {
    return value.schemes.filter((scheme) => typeof scheme === "string");
  }
  return Object.values(value).flatMap((item) => findSchemes(item));
}

if (process.platform !== "darwin") {
  throw new Error("real iOS Simulator verification requires macOS with Xcode installed");
}

command("xcodebuild", ["-version"]);
const schemeJSON = command("xcodebuild", ["-list", "-json"]);
let schemeMetadata;
try {
  schemeMetadata = JSON.parse(schemeJSON);
} catch (error) {
  throw new Error("xcodebuild returned invalid scheme metadata JSON", { cause: error });
}
const schemes = [...new Set(findSchemes(schemeMetadata))].sort();
if (!schemes.includes(VIRA_IOS_SCHEME)) {
  throw new Error(`Swift package scheme ${VIRA_IOS_SCHEME} was not found; available schemes: ${schemes.join(", ") || "none"}`);
}

const raw = command("xcrun", ["simctl", "list", "devices", "available", "-j"]);
const parsed = JSON.parse(raw);
const runtimes = parsed.devices && typeof parsed.devices === "object" ? parsed.devices : {};
const candidates = Object.values(runtimes)
  .flatMap((items) => Array.isArray(items) ? items : [])
  .filter((device) => device && typeof device === "object" && device.isAvailable !== false && typeof device.udid === "string" && /^iPhone\b/.test(String(device.name ?? "")));

if (candidates.length === 0) {
  throw new Error("no available iPhone Simulator device was found; install an iOS Simulator runtime in Xcode");
}

const device = candidates.find((candidate) => candidate.state === "Booted") ?? candidates[0];
if (device.state !== "Booted") {
  const boot = spawnSync("xcrun", ["simctl", "boot", device.udid], { stdio: "inherit" });
  if (boot.status !== 0) throw new Error(`failed to boot iOS Simulator ${device.name}`);
}
const ready = spawnSync("xcrun", ["simctl", "bootstatus", device.udid, "-b"], { stdio: "inherit" });
if (ready.status !== 0) throw new Error(`iOS Simulator ${device.name} did not become ready`);

console.log(`Running ${VIRA_IOS_SCHEME} tests on ${device.name} (${device.udid})`);
const test = spawnSync("xcodebuild", [
  "test",
  "-scheme", VIRA_IOS_SCHEME,
  "-destination", `id=${device.udid}`,
  "CODE_SIGNING_ALLOWED=NO",
], { stdio: "inherit" });
if (test.status !== 0) process.exit(test.status ?? 1);
