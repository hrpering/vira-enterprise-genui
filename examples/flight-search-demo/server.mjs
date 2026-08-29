/* global process, URL */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const requestedPort = Number.parseInt(process.env.PORT ?? "4173", 10);
const host = process.env.HOST ?? "127.0.0.1";
const explicitPort = process.env.PORT !== undefined;
const MAX_PORT_FALLBACKS = 10;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function safeFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const candidate = resolve(repoRoot, `.${decoded}`);
  const relativePath = relative(repoRoot, candidate);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return undefined;
  return candidate;
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }

  const activeAddress = server.address();
  const activePort = typeof activeAddress === "object" && activeAddress !== null ? activeAddress.port : requestedPort;
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${activePort}`}`);
  if (url.pathname === "/") {
    response.writeHead(302, { location: "/examples/flight-search-demo/" });
    response.end();
    return;
  }

  const pathname = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
  const file = safeFile(pathname);
  if (!file) {
    response.writeHead(400).end("Bad request");
    return;
  }

  try {
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "content-type": contentTypes.get(extname(file)) ?? "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

function listen(port, fallbackCount = 0) {
  const onError = (error) => {
    server.off("error", onError);
    if (
      error?.code === "EADDRINUSE"
      && !explicitPort
      && fallbackCount < MAX_PORT_FALLBACKS
    ) {
      const nextPort = port + 1;
      process.stderr.write(`Port ${port} is in use; trying ${nextPort}.\n`);
      listen(nextPort, fallbackCount + 1);
      return;
    }

    const code = typeof error?.code === "string" ? error.code : "UNKNOWN";
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Vira Flight Search demo server failed (${code}): ${message}\n`);
    process.exitCode = 1;
  };

  server.once("error", onError);
  server.listen(port, host, () => {
    server.off("error", onError);
    process.stdout.write(`Vira Flight Search demo: http://${host}:${port}/examples/flight-search-demo/\n`);
  });
}

if (!Number.isSafeInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
  process.stderr.write(`Invalid demo server PORT: ${process.env.PORT ?? ""}\n`);
  process.exitCode = 1;
} else {
  listen(requestedPort);
}
