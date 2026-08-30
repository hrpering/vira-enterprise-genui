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

const vite = await createViteServer({
  root,
  appType: "spa",
  server: { middlewareMode: true },
});
const lifecycleModule = await vite.ssrLoadModule("/src/server-lifecycle.ts");
const { createDemoStudioLifecycleService, DEMO_STUDIO_WORKSPACE_ID } = lifecycleModule;

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(body);
}

function safeId(raw) {
  if (typeof raw !== "string") return undefined;
  try {
    const value = decodeURIComponent(raw);
    return idPattern.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function fileFor(id) {
  return path.join(storeDir, `${id}.json`);
}

function objectRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameJson(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function migrateLegacyRecord(value, id) {
  if (!objectRecord(value)) return value;
  const alreadyVersioned = "version" in value
    || "workspaceId" in value
    || "draftRevision" in value
    || "recordVersion" in value
    || "publishedDraftRevision" in value;
  if (alreadyVersioned || value.id !== id) return value;

  const publication = value.publication ?? null;
  const publicationMatchesDraft = objectRecord(publication)
    && objectRecord(publication.document)
    && sameJson(publication.document, value.document);
  const draftRevision = publication !== null && !publicationMatchesDraft ? 2 : 1;
  const recordVersion = publication !== null ? draftRevision + 1 : draftRevision;

  return {
    version: "1",
    workspaceId: DEMO_STUDIO_WORKSPACE_ID,
    id: value.id,
    name: value.name,
    draftRevision,
    recordVersion,
    document: value.document,
    publication,
    publishedDraftRevision: publication !== null ? 1 : null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    publishedAt: publication !== null ? value.publishedAt : null,
  };
}

async function readRecord(id) {
  try {
    const value = JSON.parse(await readFile(fileFor(id), "utf8"));
    return migrateLegacyRecord(value, id);
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

let mutationTail = Promise.resolve();
function serializeMutation(operation) {
  const next = mutationTail.then(operation, operation);
  mutationTail = next.then(() => undefined, () => undefined);
  return next;
}

const fileStore = {
  async list(workspaceId) {
    if (workspaceId !== DEMO_STUDIO_WORKSPACE_ID) return [];
    const names = (await readdir(storeDir)).filter((name) => name.endsWith(".json")).sort();
    const records = [];
    for (const name of names) {
      const id = name.slice(0, -5);
      if (!idPattern.test(id)) throw new Error("invalid Studio demo record filename");
      const record = await readRecord(id);
      if (record) records.push(record);
    }
    return records;
  },

  async read(workspaceId, id) {
    if (workspaceId !== DEMO_STUDIO_WORKSPACE_ID) return undefined;
    return readRecord(id);
  },

  async create(record) {
    if (record.workspaceId !== DEMO_STUDIO_WORKSPACE_ID) throw new Error("unexpected Studio demo workspace");
    return serializeMutation(async () => {
      if (await readRecord(record.id)) return { ok: false, code: "ALREADY_EXISTS" };
      await writeRecord(record);
      return { ok: true, value: record };
    });
  },

  async replace(record, expectedRecordVersion) {
    if (record.workspaceId !== DEMO_STUDIO_WORKSPACE_ID) throw new Error("unexpected Studio demo workspace");
    return serializeMutation(async () => {
      const current = await readRecord(record.id);
      if (!current) return { ok: false, code: "NOT_FOUND" };
      if (current.recordVersion !== expectedRecordVersion) return { ok: false, code: "VERSION_CONFLICT" };
      await writeRecord(record);
      return { ok: true, value: record };
    });
  },

  async delete(workspaceId, id, expectedRecordVersion) {
    if (workspaceId !== DEMO_STUDIO_WORKSPACE_ID) throw new Error("unexpected Studio demo workspace");
    return serializeMutation(async () => {
      const current = await readRecord(id);
      if (!current) return { ok: false, code: "NOT_FOUND" };
      if (current.recordVersion !== expectedRecordVersion) return { ok: false, code: "VERSION_CONFLICT" };
      await unlink(fileFor(id));
      return { ok: true };
    });
  },
};

const lifecycle = createDemoStudioLifecycleService(fileStore);

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

function lifecycleStatus(issue) {
  if (issue.code === "NOT_FOUND") return 404;
  if (issue.code === "CONFLICT") return 409;
  if (issue.code === "STORE_FAILURE" || issue.code === "INVALID_CLOCK" || issue.code === "VERSION_OVERFLOW") return 500;
  return 400;
}

function sendLifecycleFailure(response, result) {
  sendJson(response, lifecycleStatus(result.issue), { error: result.issue.message, code: result.issue.code });
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/experiences" && request.method === "GET") {
    const result = await lifecycle.list(DEMO_STUDIO_WORKSPACE_ID);
    if (!result.ok) sendLifecycleFailure(response, result);
    else sendJson(response, 200, { experiences: result.value });
    return true;
  }

  if (pathname === "/api/experiences" && request.method === "POST") {
    const body = await readJsonBody(request);
    const id = safeId(body.id);
    if (!id) {
      sendJson(response, 400, { error: "invalid experience id" });
      return true;
    }
    const result = await lifecycle.create({
      workspaceId: DEMO_STUDIO_WORKSPACE_ID,
      id,
      name: typeof body.name === "string" ? body.name.trim() : "",
      document: body.document,
    });
    if (!result.ok) sendLifecycleFailure(response, result);
    else sendJson(response, 201, result.value);
    return true;
  }

  const publicMatch = pathname.match(/^\/api\/publications\/([^/]+)$/);
  if (publicMatch && request.method === "GET") {
    const id = safeId(publicMatch[1]);
    if (!id) {
      sendJson(response, 404, { error: "experience is not published" });
      return true;
    }
    const result = await lifecycle.read(DEMO_STUDIO_WORKSPACE_ID, id);
    if (!result.ok) {
      if (result.issue.code === "NOT_FOUND") sendJson(response, 404, { error: "experience is not published" });
      else sendLifecycleFailure(response, result);
      return true;
    }
    if (!result.value.publication || !result.value.publishedAt) {
      sendJson(response, 404, { error: "experience is not published" });
      return true;
    }
    sendJson(response, 200, {
      id: result.value.id,
      name: result.value.name,
      publication: result.value.publication,
      publishedAt: result.value.publishedAt,
    });
    return true;
  }

  const publicationMatch = pathname.match(/^\/api\/experiences\/([^/]+)\/publication$/);
  if (publicationMatch) {
    const id = safeId(publicationMatch[1]);
    if (!id) {
      sendJson(response, 404, { error: "experience not found" });
      return true;
    }
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      const result = await lifecycle.publish({
        workspaceId: DEMO_STUDIO_WORKSPACE_ID,
        id,
        expectedRecordVersion: body.expectedRecordVersion,
      });
      if (!result.ok) sendLifecycleFailure(response, result);
      else sendJson(response, 200, result.value);
      return true;
    }
    if (request.method === "DELETE") {
      const body = await readJsonBody(request);
      const result = await lifecycle.unpublish({
        workspaceId: DEMO_STUDIO_WORKSPACE_ID,
        id,
        expectedRecordVersion: body.expectedRecordVersion,
      });
      if (!result.ok) sendLifecycleFailure(response, result);
      else sendJson(response, 200, result.value);
      return true;
    }
  }

  const experienceMatch = pathname.match(/^\/api\/experiences\/([^/]+)$/);
  if (experienceMatch) {
    const id = safeId(experienceMatch[1]);
    if (!id) {
      sendJson(response, 404, { error: "experience not found" });
      return true;
    }
    if (request.method === "GET") {
      const result = await lifecycle.read(DEMO_STUDIO_WORKSPACE_ID, id);
      if (!result.ok) sendLifecycleFailure(response, result);
      else sendJson(response, 200, result.value);
      return true;
    }
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      const result = await lifecycle.save({
        workspaceId: DEMO_STUDIO_WORKSPACE_ID,
        id,
        name: typeof body.name === "string" ? body.name.trim() : "",
        document: body.document,
        expectedRecordVersion: body.expectedRecordVersion,
      });
      if (!result.ok) sendLifecycleFailure(response, result);
      else sendJson(response, 200, result.value);
      return true;
    }
    if (request.method === "DELETE") {
      const body = await readJsonBody(request);
      const result = await lifecycle.delete({
        workspaceId: DEMO_STUDIO_WORKSPACE_ID,
        id,
        expectedRecordVersion: body.expectedRecordVersion,
      });
      if (!result.ok) sendLifecycleFailure(response, result);
      else sendJson(response, 200, { deleted: true, id: result.value.id });
      return true;
    }
  }

  return false;
}

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
    const invalidBody = error instanceof SyntaxError || (error instanceof Error && error.message === "request body is too large");
    if (!response.headersSent) sendJson(response, invalidBody ? 400 : 500, { error: invalidBody ? "invalid request body" : "Studio demo server failed" });
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
