import { createServer, type Server, type ServerResponse } from "node:http";
import type { ViraRuntimeEnvironment } from "./runtime-environment.js";

function json(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(`${JSON.stringify(body)}\n`);
}

export function createViraServiceServer(config: ViraRuntimeEnvironment): Server {
  return createServer((request, response) => {
    if (request.method !== "GET") {
      json(response, 405, { error: "method_not_allowed" });
      return;
    }

    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/healthz") {
      json(response, 200, { status: "ok", service: config.service, environment: config.environment });
      return;
    }
    if (pathname === "/readyz") {
      json(response, 200, { status: "ready", service: config.service, environment: config.environment });
      return;
    }
    if (pathname === "/build") {
      json(response, 200, {
        version: "1",
        service: config.service,
        environment: config.environment,
        buildSha: config.buildSha,
        releaseId: config.releaseId,
      });
      return;
    }

    json(response, 404, { error: "not_found" });
  });
}
