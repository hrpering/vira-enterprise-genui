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

run("Enterprise RC baseline", "pnpm", ["verify:enterprise-rc"]);
run("Independent external publisher proof", "pnpm", ["verify:external-publisher-proof"]);
run("Independent external AI-host proof", "pnpm", ["verify:external-ai-host-proof"]);
run("Independent external provider proof", "pnpm", ["verify:external-provider-proof"]);
run("Cross-surface Application Network semantics", "pnpm", ["verify:application-network-cross-surface"]);

console.log("\nVira Application Network RC gate PASS on the exact current checkout.");
