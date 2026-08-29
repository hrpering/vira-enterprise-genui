/* global process, URL */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const host = process.env.HOST ?? "127.0.0.1";

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

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
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

server.listen(port, host, () => {
  process.stdout.write(`Vira Flight Search demo: http://${host}:${port}/examples/flight-search-demo/\n`);
});
