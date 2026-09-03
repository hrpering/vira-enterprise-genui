import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const MIN_GRADLE = [9, 6, 0];

function executable(name, fallback) {
  const probe = spawnSync(name, ["version"], { stdio: "ignore" });
  if (!probe.error) return name;
  if (fallback && existsSync(fallback)) return fallback;
  return undefined;
}

function parseVersion(text) {
  const match = /Gradle\s+(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : undefined;
}

function versionAtLeast(actual, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
}

const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (!androidHome) {
  throw new Error("ANDROID_HOME or ANDROID_SDK_ROOT is required for the Android Emulator RC gate");
}
const platformJar = join(androidHome, "platforms", "android-36", "android.jar");
const buildTools = join(androidHome, "build-tools", "36.0.0");
if (!existsSync(platformJar)) {
  throw new Error("Android API 36 is required for the Android Emulator RC gate");
}
if (!existsSync(buildTools)) {
  throw new Error("Android Build Tools 36.0.0 are required for the Android Emulator RC gate");
}

const adb = executable("adb", join(androidHome, "platform-tools", "adb"));
if (!adb) throw new Error("adb is required for the Android Emulator RC gate");

const devices = spawnSync(adb, ["devices"], { encoding: "utf8" });
if (devices.error || devices.status !== 0) throw new Error("adb devices failed");
const emulator = devices.stdout
  .split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/))
  .find(([serial, state]) => serial?.startsWith("emulator-") && state === "device");
if (!emulator?.[0]) {
  throw new Error("no connected Android Emulator was found; boot an AVD before running the RC gate");
}

const boot = spawnSync(adb, ["-s", emulator[0], "shell", "getprop", "sys.boot_completed"], { encoding: "utf8" });
if (boot.error || boot.status !== 0 || boot.stdout.trim() !== "1") {
  throw new Error(`Android Emulator ${emulator[0]} is connected but has not completed boot`);
}

const gradleProbe = spawnSync("gradle", ["--version"], { encoding: "utf8" });
if (gradleProbe.error || gradleProbe.status !== 0) {
  throw new Error("Gradle 9.6+ must be available on PATH for the Android Emulator RC gate");
}
const gradleVersion = parseVersion(`${gradleProbe.stdout}\n${gradleProbe.stderr ?? ""}`);
if (!gradleVersion || !versionAtLeast(gradleVersion, MIN_GRADLE)) {
  throw new Error(`Gradle 9.6+ is required for the Android Emulator RC gate; observed ${gradleVersion?.join(".") ?? "unknown"}`);
}

console.log(`Running Vira Android instrumentation tests on ${emulator[0]} with Gradle ${gradleVersion.join(".")}`);
const test = spawnSync("gradle", [
  "--no-daemon",
  "-p", "sdk/android",
  ":vira-android:assembleDebug",
  ":vira-android:connectedDebugAndroidTest",
], { stdio: "inherit", env: process.env });
if (test.status !== 0) process.exit(test.status ?? 1);
