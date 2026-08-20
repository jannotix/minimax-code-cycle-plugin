#!/usr/bin/env node
// Freeze a Cycle candidate from a worktree. Produces a candidate
// manifest at .cycle/candidates/<id>/manifest.json. The manifest
// records the base revision, the changed paths, and a per-file plus
// whole-manifest SHA-256 digest.

import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, relative, join, dirname } from "node:path";
import { spawn } from "node:child_process";

const SKIP_PATTERNS = [/(^|\/)\.git\//, /(^|\/)\.cycle\//, /(^|\/)\.cycle-tmp\//, /node_modules\//];
const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16 MiB per PROTOCOL.md

function usage() {
  process.stderr.write(
    "usage: freeze-candidate <project-root> --base <git-revision> [--out <dir>]\n",
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

function shouldSkip(path) {
  return SKIP_PATTERNS.some((re) => re.test(path));
}

function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`git ${args.join(" ")}: ${stderr.trim() || `exit ${code}`}`));
    });
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalize(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + canonicalize(v)).join(",") + "}";
}

async function diffNames(projectRoot, base) {
  const names = await runGit(projectRoot, ["diff", "--name-status", `${base}..HEAD`]);
  const entries = [];
  for (const line of names.split(/\r?\n/).filter(Boolean)) {
    const [code, ...rest] = line.split("\t");
    if (code === undefined || rest.length === 0) continue;
    const op = code.startsWith("A") ? "added" : code.startsWith("D") ? "removed" : "modified";
    const path = rest[rest.length - 1];
    entries.push({ op, path });
  }
  return entries;
}

async function buildManifest(projectRoot, base) {
  const changed = await diffNames(projectRoot, base);
  const files = [];
  for (const { op, path } of changed) {
    if (shouldSkip(path)) continue;
    if (op === "removed") {
      files.push({ path, operation: op, sha256: null, size_bytes: 0 });
      continue;
    }
    const absolute = join(projectRoot, path);
    const stats = await stat(absolute);
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`file ${path} exceeds ${MAX_FILE_SIZE} bytes`);
    }
    const bytes = await readFile(absolute);
    files.push({
      path,
      operation: op,
      sha256: sha256(bytes),
      size_bytes: stats.size,
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const candidateDigest = sha256(Buffer.from(canonicalize({ files }), "utf8"));
  return {
    schema: "cycle.candidate.v1",
    id: randomUUID(),
    workflow_id: process.env.CYCLE_WORKFLOW_ID ?? "00000000-0000-0000-0000-000000000000",
    base_revision: base,
    frozen_at_unix_millis: Date.now(),
    manifest: files,
    candidate_digest: candidateDigest,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = args._[0];
  const base = args.flags.base;
  const outDir = args.flags.out;
  if (projectRoot === undefined || base === undefined) usage();

  const absRoot = resolve(projectRoot);
  const manifest = await buildManifest(absRoot, base);

  const targetDir = resolve(outDir ?? join(absRoot, ".cycle", "candidates", manifest.id));
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    join(targetDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(`freeze-candidate: ${error.message}\n`);
  process.exit(1);
});
