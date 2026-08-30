#!/usr/bin/env node
// Query a Cycle graph index. Reads .cycle/graph/manifest.json and
// answers scoped queries. No state is modified.

import { readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

const QUERIES = new Set([
  "declarations",
  "signature",
  "imports",
  "importers",
  "types",
  "dependents",
]);

const UNSUPPORTED_QUERIES = new Set(["callers", "callees", "path"]);

const DEFAULT_LIMIT = 200;
const HARD_LIMIT = 10000;
const HARD_TIMEOUT_MS = 5000;

function usage() {
  process.stderr.write(
    "usage: graph-query <project-root> <query> [args]\n" +
      "  queries: declarations | signature | imports | importers | types | dependents\n" +
      "  filters: --name <glob> --kind <list> --path <glob> --limit <n>\n",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      args.flags[token.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      args._.push(token);
    }
  }
  return args;
}

function globToRegex(glob) {
  let pattern = "^";
  for (const ch of glob) {
    if (ch === "*") pattern += ".*";
    else if (ch === "?") pattern += ".";
    else if (/[.+^$(){}|[\]\\]/.test(ch)) pattern += "\\" + ch;
    else pattern += ch;
  }
  pattern += "$";
  return new RegExp(pattern);
}

function matches(value, pattern) {
  if (pattern === undefined) return true;
  return globToRegex(pattern).test(value);
}

function limitOrTruncate(results, limit) {
  if (results.length <= limit) return { results, truncated: false };
  return { results: results.slice(0, limit), truncated: true };
}

async function readManifest(projectRoot) {
  const path = join(projectRoot, ".cycle", "graph", "manifest.json");
  await stat(path);
  const text = await readFile(path, "utf8");
  return JSON.parse(text);
}

function findFile(manifest, pathGlob) {
  return manifest.files.find((file) => file.path !== undefined && matches(file.path, pathGlob));
}

function queryDeclarations(manifest, flags) {
  const kinds = flags.kind?.split(",").map((s) => s.trim()) ?? null;
  const nameRe = flags.name !== undefined ? globToRegex(flags.name) : null;
  const results = [];
  for (const file of manifest.files) {
    if (!matches(file.path, flags.path)) continue;
    for (const decl of file.declarations ?? []) {
      if (nameRe !== null && !nameRe.test(decl.name)) continue;
      if (kinds !== null && !declMatchesKind(decl, kinds)) continue;
      results.push({ kind: "declaration", path: file.path, name: decl.name, line: decl.line });
    }
  }
  return results;
}

function declMatchesKind(decl, kinds) {
  if (decl.kind !== undefined) return kinds.includes(decl.kind);
  return kinds.some((k) => k === "declaration");
}

function querySignature(manifest, flags) {
  if (flags.path === undefined || flags.name === undefined) usage();
  const file = findFile(manifest, flags.path);
  if (file === undefined) return [];
  const decl = (file.declarations ?? []).find((d) => d.name === flags.name);
  if (decl === undefined) return [];
  return [{ kind: "signature", path: file.path, name: decl.name, line: decl.line, data: decl }];
}

function queryImports(manifest, flags) {
  if (flags.path === undefined) usage();
  const file = findFile(manifest, flags.path);
  if (file === undefined) return [];
  return (file.imports ?? []).map((imp) => ({
    kind: "import",
    path: file.path,
    name: null,
    line: imp.line,
    data: { text: imp.text },
  }));
}

function queryImporters(manifest, flags) {
  if (flags.path === undefined) usage();
  const target = flags.path;
  const results = [];
  for (const file of manifest.files) {
    for (const imp of file.imports ?? []) {
      if (imp.text.includes(target)) {
        results.push({ kind: "import", path: file.path, name: null, line: imp.line });
      }
    }
  }
  return results;
}

function queryDependents(manifest, flags) {
  // In v1, dependents == importers (no separate type-reference index yet).
  return queryImporters(manifest, flags);
}

function queryTypes(manifest, flags) {
  if (flags.path === undefined) usage();
  const file = findFile(manifest, flags.path);
  if (file === undefined) return [];
  return (file.imports ?? [])
    .filter((imp) => /:\s*[A-Z][\w]*|as\s+[A-Z]|<\s*[A-Z]/.test(imp.text))
    .map((imp) => ({ kind: "type_ref", path: file.path, name: null, line: imp.line }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = args._[0];
  const query = args._[1];
  if (projectRoot === undefined || query === undefined) usage();
  if (UNSUPPORTED_QUERIES.has(query)) {
    throw new Error(`query '${query}' is not implemented in 2.0.0-alpha.5`);
  }
  if (!QUERIES.has(query)) usage();
  if (args.flags.since !== undefined) {
    throw new Error("--since is not implemented in 2.0.0-alpha.5");
  }

  const absRoot = resolve(projectRoot);
  const start = Date.now();
  const manifest = await readManifest(absRoot);

  let results = [];
  switch (query) {
    case "declarations": results = queryDeclarations(manifest, args.flags); break;
    case "signature":    results = querySignature(manifest, args.flags);    break;
    case "imports":      results = queryImports(manifest, args.flags);      break;
    case "importers":    results = queryImporters(manifest, args.flags);    break;
    case "dependents":   results = queryDependents(manifest, args.flags);   break;
    case "types":        results = queryTypes(manifest, args.flags);        break;
  }

  const elapsed = Date.now() - start;
  if (elapsed > HARD_TIMEOUT_MS) {
    process.stderr.write(`query exceeded ${HARD_TIMEOUT_MS}ms, add filters\n`);
    process.exit(1);
  }

  const limit = Number.parseInt(args.flags.limit ?? String(DEFAULT_LIMIT), 10);
  const safeLimit = Math.min(HARD_LIMIT, Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT);
  const { results: bounded, truncated } = limitOrTruncate(results, safeLimit);

  for (const entry of bounded) process.stdout.write(JSON.stringify(entry) + "\n");
  if (truncated) process.stderr.write(`truncated at ${safeLimit}, add filters\n`);
}

main().catch((error) => {
  process.stderr.write(`graph-query: ${error.message}\n`);
  process.exit(1);
});
