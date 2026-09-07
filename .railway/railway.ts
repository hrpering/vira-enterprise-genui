import { defineRailway, github, project, service } from "railway/iac";

const REPOSITORY = "hrpering/vira-enterprise-genui";
const REGION = "europe-west4-drams3a";
const BRANCH_PATTERN = /^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._/-]{1,200}$/;

function sourceBranch(): string {
  const branch = process.env.VIRA_RAILWAY_SOURCE_BRANCH?.trim() || "main";
  if (!BRANCH_PATTERN.test(branch)) throw new Error("VIRA_RAILWAY_SOURCE_BRANCH is not a bounded Git branch name");
  return branch;
}

function runtimeEnvironment(ctx: { isEnvironment(name: string): boolean }): "development" | "staging" | "production" {
  if (ctx.isEnvironment("production")) return "production";
  if (ctx.isEnvironment("staging")) return "staging";
  if (ctx.isEnvironment("development")) return "development";
  throw new Error("Railway environment must be named development, staging or production");
}

export default defineRailway((ctx) => {
  const environment = runtimeEnvironment(ctx);
  const branch = sourceBranch();
  if (environment === "production" && branch !== "main") {
    throw new Error("production Railway services must deploy from main");
  }

  const sourceOptions = {
    branch,
    autoDeploy: false,
    watchPatterns: ["apps/**", "ops/**", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig*.json"],
  };
  const serviceEnvironment = { VIRA_ENVIRONMENT: environment };

  const api = service("vira-api", {
    source: github(REPOSITORY, sourceOptions),
    build: "pnpm build",
    start: "node .build/apps/vira-api/src/index.js",
    healthcheck: "/readyz",
    healthcheckTimeout: 300,
    replicas: { [REGION]: 1 },
    env: serviceEnvironment,
  });

  const worker = service("vira-worker", {
    source: github(REPOSITORY, sourceOptions),
    build: "pnpm build",
    start: "node .build/apps/vira-worker/src/index.js",
    healthcheck: "/readyz",
    healthcheckTimeout: 300,
    replicas: { [REGION]: 1 },
    env: serviceEnvironment,
  });

  return project("vira-enterprise", { resources: [api, worker] });
});
