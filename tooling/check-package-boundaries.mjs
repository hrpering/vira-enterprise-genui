/* global process */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allowedDependencies, workspaceScope } from "./package-boundaries.config.mjs";

const dependencySections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);

function internalPackageName(specifier) {
  if (!specifier.startsWith(workspaceScope)) return null;
  const parts = specifier.split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
}

async function sourceFiles(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return files;
    throw error;
  }

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(absolute));
    else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

function importSpecifiers(source) {
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const result = new Set();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) result.add(match[1]);
  }
  return result;
}

function dependencyNames(manifest) {
  const result = new Set();
  for (const section of dependencySections) {
    for (const name of Object.keys(manifest[section] ?? {})) {
      if (name.startsWith(workspaceScope)) result.add(name);
    }
  }
  return result;
}

function workspaceFolderForPath(absolutePath, packagesDir) {
  const relative = path.relative(packagesDir, absolutePath);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return null;
  return relative.split(path.sep)[0] ?? null;
}

function findCycles(nodes, edges) {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(node) {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      cycles.push([...stack.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;

    visiting.add(node);
    stack.push(node);
    for (const target of edges.get(node) ?? []) visit(target);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of nodes) visit(node);
  return cycles;
}

export async function validateWorkspace(rootDir) {
  const packagesDir = path.join(rootDir, "packages");
  const packageEntries = (await readdir(packagesDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const packages = new Map();
  const packageNameToFolder = new Map();
  const errors = [];

  for (const entry of packageEntries) {
    const folder = entry.name;
    if (!(folder in allowedDependencies)) {
      errors.push({ code: "UNCONFIGURED_PACKAGE", package: folder, message: `${folder} is missing from package-boundaries.config.mjs` });
      continue;
    }
    const manifestPath = path.join(packagesDir, folder, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (packageNameToFolder.has(manifest.name)) {
      errors.push({ code: "DUPLICATE_PACKAGE_NAME", package: folder, target: manifest.name, message: `${folder} duplicates internal package name ${manifest.name}` });
      continue;
    }
    packages.set(folder, { folder, manifest, root: path.join(packagesDir, folder) });
    packageNameToFolder.set(manifest.name, folder);
  }

  const edges = new Map([...packages.keys()].map((folder) => [folder, new Set()]));

  for (const [folder, info] of packages) {
    const allowed = new Set(allowedDependencies[folder]);
    const declared = dependencyNames(info.manifest);

    for (const packageName of declared) {
      const target = packageNameToFolder.get(packageName);
      if (!target) {
        errors.push({ code: "UNKNOWN_INTERNAL_DEPENDENCY", package: folder, target: packageName, message: `${folder} declares unknown internal package ${packageName}` });
        continue;
      }
      edges.get(folder).add(target);
      if (!allowed.has(target)) {
        errors.push({ code: "FORBIDDEN_DEPENDENCY", package: folder, target, message: `${folder} must not depend on ${target}` });
      }
    }

    for (const file of await sourceFiles(path.join(info.root, "src"))) {
      const source = await readFile(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (specifier.startsWith(".")) {
          const resolved = path.resolve(path.dirname(file), specifier);
          const targetFolder = workspaceFolderForPath(resolved, packagesDir);
          if (targetFolder && targetFolder !== folder && packages.has(targetFolder)) {
            edges.get(folder).add(targetFolder);
            errors.push({
              code: "CROSS_PACKAGE_RELATIVE_IMPORT",
              package: folder,
              target: targetFolder,
              file: path.relative(rootDir, file),
              message: `${folder} reaches into ${targetFolder} through a relative import; use the package public API`,
            });
          }
          continue;
        }

        const packageName = internalPackageName(specifier);
        if (!packageName) continue;
        const target = packageNameToFolder.get(packageName);
        if (!target) {
          errors.push({ code: "UNKNOWN_INTERNAL_IMPORT", package: folder, target: packageName, file: path.relative(rootDir, file), message: `${folder} imports unknown internal package ${packageName}` });
          continue;
        }
        edges.get(folder).add(target);
        if (!declared.has(packageName)) {
          errors.push({ code: "UNDECLARED_INTERNAL_IMPORT", package: folder, target, file: path.relative(rootDir, file), message: `${folder} imports ${target} without declaring ${packageName}` });
        }
        if (!allowed.has(target)) {
          errors.push({ code: "FORBIDDEN_DEPENDENCY", package: folder, target, file: path.relative(rootDir, file), message: `${folder} must not import ${target}` });
        }
      }
    }
  }

  for (const cycle of findCycles(packages.keys(), edges)) {
    errors.push({ code: "CIRCULAR_DEPENDENCY", cycle, message: `Circular package dependency: ${cycle.join(" -> ")}` });
  }

  return {
    ok: errors.length === 0,
    errors,
    edges: Object.fromEntries([...edges].map(([name, targets]) => [name, [...targets].sort()])),
  };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const rootDir = path.resolve(path.dirname(scriptPath), "..");
  const result = await validateWorkspace(rootDir);
  if (!result.ok) {
    for (const error of result.errors) process.stderr.write(`[${error.code}] ${error.message}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("Package boundary check passed.\n");
  }
}
