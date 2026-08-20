#!/usr/bin/env node
// Verify a Cycle audit JSONL ledger. Exits 0 if the chain is intact,
// 1 if any line fails validation, 2 on usage errors.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ZERO = "0".repeat(64);

function canonicalize(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + canonicalize(v)).join(",") + "}";
}

function lineHash(line) {
  const obj = JSON.parse(line);
  const { hash, ...withoutHash } = obj;
  return createHash("sha256").update(canonicalize(withoutHash)).digest("hex");
}

async function readLines(path) {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/).filter((line) => line.length > 0);
}

function usage() {
  process.stderr.write("usage: verify-audit <path-to-audit.jsonl>\n");
  process.exit(2);
}

async function main() {
  const target = process.argv[2];
  if (target === undefined) usage();

  const lines = await readLines(resolve(target));
  if (lines.length === 0) {
    process.stderr.write("audit ledger is empty\n");
    process.exit(1);
  }

  let prev = ZERO;
  let seq = 0;
  for (const line of lines) {
    seq += 1;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (error) {
      process.stderr.write(`line ${seq}: invalid json\n`);
      process.exit(1);
    }
    if (entry.prev_hash !== prev) {
      process.stderr.write(`line ${seq}: prev_hash mismatch\n`);
      process.exit(1);
    }
    if (entry.seq !== seq) {
      process.stderr.write(`line ${seq}: seq mismatch (expected ${seq}, got ${entry.seq})\n`);
      process.exit(1);
    }
    if (entry.hash !== lineHash(line)) {
      process.stderr.write(`line ${seq}: hash mismatch\n`);
      process.exit(1);
    }
    prev = entry.hash;
  }

  process.stdout.write(`ok: ${seq} lines, chain intact\n`);
}

main().catch((error) => {
  process.stderr.write(`verify-audit: ${error.message}\n`);
  process.exit(1);
});
