import type { Server } from "node:http";
import type { ViraRuntimeEnvironment } from "./runtime-environment.js";
import { createViraServiceServer } from "./service-http.js";

export function startViraService(config: ViraRuntimeEnvironment): Server {
  const server = createViraServiceServer(config);
  server.once("error", (error) => {
    console.error("VIRA_SERVICE_START_FAILED", error);
    process.exitCode = 1;
  });
  server.listen(config.port, "0.0.0.0", () => {
    console.log(JSON.stringify({ event: "vira.service.ready", ...config }));
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({ event: "vira.service.shutdown", service: config.service, signal }));
    const forced = setTimeout(() => {
      process.exitCode = 1;
      server.closeAllConnections();
    }, 10_000);
    forced.unref();
    server.close((error) => {
      clearTimeout(forced);
      if (error !== undefined) {
        console.error("VIRA_SERVICE_SHUTDOWN_FAILED", error);
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  return server;
}
