import { parseJsonValue, type JsonObject } from "@vira-enterprise-genui/protocol";
import {
  evaluateViraCrossPlatformConformance,
  VIRA_CONFORMANCE_PLATFORMS,
  VIRA_CROSS_PLATFORM_CONFORMANCE_VERSION,
  type ViraConformancePlatform,
  type ViraCrossPlatformConformanceResult,
  type ViraPlatformSemanticSnapshot,
} from "./index.js";

export interface ViraCrossPlatformFixture {
  readonly version: typeof VIRA_CROSS_PLATFORM_CONFORMANCE_VERSION;
  readonly id: string;
  readonly input: JsonObject;
}

export interface ViraConformanceRunner {
  readonly version: typeof VIRA_CROSS_PLATFORM_CONFORMANCE_VERSION;
  readonly platform: ViraConformancePlatform;
  readonly run: (fixture: ViraCrossPlatformFixture) => ViraPlatformSemanticSnapshot | Promise<ViraPlatformSemanticSnapshot>;
}

export type ViraCrossPlatformFixtureRunResult =
  | ViraCrossPlatformConformanceResult
  | { readonly ok: false; readonly issue: { readonly code: "INVALID_RUNNERS" | "RUNNER_FAILED"; readonly path: string; readonly message: string } };

function bounded(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 256; }
function failure(code: "INVALID_RUNNERS" | "RUNNER_FAILED", path: string, message: string): ViraCrossPlatformFixtureRunResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}
function canonicalFixture(raw: ViraCrossPlatformFixture): ViraCrossPlatformFixture | undefined {
  if (!raw || raw.version !== "1" || !bounded(raw.id)) return undefined;
  const parsed = parseJsonValue(raw.input, "$.fixture.input");
  if (!parsed.ok || parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return undefined;
  return Object.freeze({ version: "1", id: raw.id, input: parsed.value as JsonObject });
}

export async function runViraCrossPlatformFixture(input: {
  readonly fixture: ViraCrossPlatformFixture;
  readonly runners: readonly ViraConformanceRunner[];
}): Promise<ViraCrossPlatformFixtureRunResult> {
  const fixture = canonicalFixture(input?.fixture);
  if (!fixture || !Array.isArray(input?.runners) || input.runners.length !== 3) return failure("INVALID_RUNNERS", "$", "one fixture and exactly three platform runners are required");

  const byPlatform = new Map<ViraConformancePlatform, ViraConformanceRunner>();
  for (let index = 0; index < input.runners.length; index += 1) {
    const runner = input.runners[index];
    if (!runner || runner.version !== "1" || (runner.platform !== "web" && runner.platform !== "ios" && runner.platform !== "android") || typeof runner.run !== "function" || byPlatform.has(runner.platform)) {
      return failure("INVALID_RUNNERS", `$.runners[${index}]`, "runner must uniquely own one peer platform");
    }
    byPlatform.set(runner.platform, runner);
  }

  const snapshots: ViraPlatformSemanticSnapshot[] = [];
  for (let index = 0; index < VIRA_CONFORMANCE_PLATFORMS.length; index += 1) {
    const platform = VIRA_CONFORMANCE_PLATFORMS[index]!;
    const runner = byPlatform.get(platform);
    if (!runner) return failure("INVALID_RUNNERS", "$.runners", `missing ${platform} runner`);
    try {
      snapshots.push(await runner.run(fixture));
    } catch {
      return failure("RUNNER_FAILED", `$.runners.${platform}`, `${platform} conformance runner failed closed`);
    }
  }
  return evaluateViraCrossPlatformConformance({ fixtureId: fixture.id, snapshots });
}
