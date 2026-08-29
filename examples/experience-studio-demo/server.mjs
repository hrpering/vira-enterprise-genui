/* global Buffer, console, process, URL */
import { createServer as createHttpServer } from "node:http";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const configuredDataDir = process.env.VIRA_STUDIO_DATA_DIR;
const dataDir = configuredDataDir ? path.resolve(root, configuredDataDir) : path.join(root, ".data");
const storeDir = path.join(dataDir, "experiences");
const idPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

await mkdir(storeDir, { recursive: true });

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(body);
}

function safeId(raw) {
  if (typeof raw !== "string") return undefined;
  const value = decodeURIComponent(raw);
  return idPattern.test(value) ? value : undefined;
}

function fileFor(id) {
  return path.join(storeDir, `${id}.json`);
}

async function readRecord(id) {
  try {
    return JSON.parse(await readFile(fileFor(id), "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeRecord(record) {
  const target = fileFor(record.id);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > 2_000_000) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validDocument(value, expectedId) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && value.version === "1"
    && value.id === expectedId
    && typeof value.recipeId === "string"
    && typeof value.entryView === "string"
    && Array.isArray(value.views)
    && value.views.length > 0
    && Array.isArray(value.bindings)
    && Array.isArray(value.interactions);
}

function validPublication(value, expectedId) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && value.id === expectedId
    && value.document !== null
    && typeof value.document === "object"
    && !Array.isArray(value.document)
    && value.document.id === expectedId;
}

async function listSummaries() {
  const names = (await readdir(storeDir)).filter((name) => name.endsWith(".json")).sort();
  const summaries = [];
  for (const name of names) {
    const id = name.slice(0, -5);
    const record = await readRecord(id);
    if (!record) continue;
    summaries.push({
      id: record.id,
      name: record.name,
      published: record.publication !== null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      publishedAt: record.publishedAt,
    });
  }
  return summaries.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/experiences" && request.method === "GET") {
    sendJson(response, 200, { experiences: await listSummaries() });
    return true;
  }

  if (pathname === "/api/experiences" && request.method === "POST") {
    const body = await readJsonBody(request);
    const id = safeId(body.id);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!id || name.length < 1 || name.length > 120 || !validDocument(body.document, id)) {
      sendJson(response, 400, { error: "invalid experience create payload" });
      return true;
    }
    if (await readRecord(id)) {
      sendJson(response, 409, { error: "experience already exists" });
      return true;
    }
    const now = new Date().toISOString();
    const record = {
      id,
      name,
      document: body.document,
      publication: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    };
    await writeRecord(record);
    sendJson(response, 201, record);
    return true;
  }

  const publicMatch = pathname.match(/^\/api\/publications\/([^/]+)$/);
  if (publicMatch && request.method === "GET") {
    const id = safeId(publicMatch[1]);
    const record = id ? await readRecord(id) : undefined;
    if (!record?.publication) {
      sendJson(response, 404, { error: "experience is not published" });
      return true;
    }
    sendJson(response, 200, {
      id: record.id,
      name: record.name,
      publication: record.publication,
      publishedAt: record.publishedAt,
    });
    return true;
  }

  const publicationMatch = pathname.match(/^\/api\/experiences\/([^/]+)\/publication$/);
  if (publicationMatch) {
    const id = safeId(publicationMatch[1]);
    const record = id ? await readRecord(id) : undefined;
    if (!id || !record) {
      sendJson(response, 404, { error: "experience not found" });
      return true;
    }
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      if (!validPublication(body.publication, id)) {
        sendJson(response, 400, { error: "invalid Studio publication" });
        return true;
      }
      const now = new Date().toISOString();
      const next = { ...record, publication: body.publication, updatedAt: now, publishedAt: now };
      await writeRecord(next);
      sendJson(response, 200, next);
      return true;
    }
    if (request.method === "DELETE") {
      const now = new Date().toISOString();
      const next = { ...record, publication: null, updatedAt: now, publishedAt: null };
      await writeRecord(next);
      sendJson(response, 200, next);
      return true;
    }
  }

  const experienceMatch = pathname.match(/^\/api\/experiences\/([^/]+)$/);
  if (experienceMatch) {
    const id = safeId(experienceMatch[1]);
    const record = id ? await readRecord(id) : undefined;
    if (!id || !record) {
      sendJson(response, 404, { error: "experience not found" });
      return true;
    }
    if (request.method === "GET") {
      sendJson(response, 200, record);
      return true;
    }
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      const name = typeof body.name === "string" ? body.name.trim() : record.name;
      if (name.length < 1 || name.length > 120 || !validDocument(body.document, id)) {
        sendJson(response, 400, { error: "invalid Studio draft" });
        return true;
      }
      const next = { ...record, name, document: body.document, updatedAt: new Date().toISOString() };
      await writeRecord(next);
      sendJson(response, 200, next);
      return true;
    }
    if (request.method === "DELETE") {
      await unlink(fileFor(id));
      sendJson(response, 200, { deleted: true, id });
      return true;
    }
  }

  return false;
}

const vite = await createViteServer({
  root,
  appType: "spa",
  server: { middlewareMode: true },
});

const server = createHttpServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, url.pathname);
      if (!handled) sendJson(response, 404, { error: "API route not found" });
      return;
    }
    vite.middlewares(request, response, () => {
      response.statusCode = 404;
      response.end("Not found");
    });
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "Studio demo server failed" });
    else response.end();
  }
});

server.listen(port, host, () => {
  console.log(`Vira Experience Studio lifecycle demo: http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await vite.close();
    server.close(() => process.exit(0));
  });
}
