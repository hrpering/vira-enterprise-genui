import { spawnSync } from "node:child_process";

function run(label, command, args) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) {
    console.error(`${label} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status ?? "unknown"}`);
    process.exit(result.status ?? 1);
  }
}

run("Repository + browser gates", "pnpm", ["verify:all"]);
run("Portable native conformance", "pnpm", ["check:studio-native"]);
run("iOS Simulator gate", "pnpm", ["verify:ios-simulator"]);
run("Android Emulator gate", "pnpm", ["verify:android-emulator"]);
run("External Pegasus proof evidence", "pnpm", ["verify:pegasus-proof"]);

console.log("\nVira Enterprise RC gate PASS on the exact current checkout.");
