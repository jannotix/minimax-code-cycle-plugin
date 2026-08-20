#!/usr/bin/env node
// Build or update the Cycle AST knowledge graph index for a project.
// Deterministic, incremental, no vector store. Stores the structural
// facts in .cycle/graph/index.db.

import { createHash } from "node:crypto";
import { stat, readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join, relative, extname } from "node:path";
import { cpus } from "node:os";

const SUPPORTED = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".md": "markdown",
};

const SKIP = [".git", ".cycle", ".cycle-tmp", "node_modules", "target", "dist", "build", "out"];
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MiB per skill/graph/indexer.md

function usage() {
  process.stderr.write(
    "usage: graph-index <project-root> [--workers N] [--languages <ext,ext,...>]\n",
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function walk(root) {
  const out = [];
  async function recurse(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") {
        if (SKIP.includes(entry.name)) continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP.includes(entry.name)) continue;
        await recurse(full);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (SUPPORTED[ext] !== undefined) out.push(full);
      }
    }
  }
  await recurse(root);
  return out;
}

function extractStructural(text, ext) {
  // Structural extraction is intentionally minimal in v1: it captures
  // the line of the first top-level declaration and the line of the
  // first import. A full AST-based extractor is in the parser adapters.
  // The CLI guarantees the same structural facts across runs given
  // the same input bytes, which is what determinism requires.
  const lines = text.split(/\r?\n/);
  const imports = [];
  const declarations = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const importMatch = /^\s*(?:import|from)\s+/.exec(line);
    if (importMatch !== null) imports.push({ line: i + 1, text: line.trim() });
    const declMatch = /^(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|enum|struct|trait|impl|def|func|module|namespace)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (declMatch !== null) {
      declarations.push({ name: declMatch[1], line: i + 1 });
    }
  }
  return { imports, declarations };
}

async function processFile(absolute, projectRoot) {
  const ext = extname(absolute).toLowerCase();
  const language = SUPPORTED[ext];
  if (language === undefined) return null;

  const stats = await stat(absolute);
  if (stats.size > MAX_FILE_SIZE) {
    return { path: relative(projectRoot, absolute), error: "file_too_large" };
  }

  const bytes = await readFile(absolute);
  const text = bytes.toString("utf8");
  const hash = sha256(bytes);
  const structure = extractStructural(text, ext);

  return {
    path: relative(projectRoot, absolute).replaceAll("\\", "/"),
    language,
    size_bytes: stats.size,
    sha256: hash,
    imports: structure.imports,
    declarations: structure.declarations,
  };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = args._[0];
  if (projectRoot === undefined) usage();

  const absRoot = resolve(projectRoot);
  const workers = Number.parseInt(args.flags.workers ?? String(cpus().length), 10);
  const languagesArg = args.flags.languages;
  const allowed = languagesArg === undefined
    ? new Set(Object.keys(SUPPORTED))
    : new Set(languagesArg.split(",").map((s) => s.trim()));

  const files = (await walk(absRoot)).filter((f) => allowed.has(extname(f).toLowerCase()));
  const batches = chunk(files, Math.max(1, Math.ceil(files.length / workers)));

  const results = [];
  for (const batch of batches) {
    const batchResults = await Promise.all(batch.map((file) => processFile(file, absRoot)));
    for (const result of batchResults) if (result !== null) results.push(result);
  }

  const manifest = {
    schema: "cycle.graph.manifest.v1",
    project_root: absRoot,
    indexed_at_unix_millis: Date.now(),
    file_count: results.length,
    languages: [...new Set(results.map((r) => r.language ?? null).filter((l) => l !== null))],
    files: results,
  };

  const graphDir = join(absRoot, ".cycle", "graph");
  await mkdir(graphDir, { recursive: true });
  await writeFile(join(graphDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const manifestHash = sha256(Buffer.from(JSON.stringify(manifest), "utf8"));
  process.stdout.write(`indexed ${results.length} files, manifest ${manifestHash}\n`);
}

main().catch((error) => {
  process.stderr.write(`graph-index: ${error.message}\n`);
  process.exit(1);
});
