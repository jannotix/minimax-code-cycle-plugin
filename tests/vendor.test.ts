import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, extname, join, relative } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

test("the vendored parser allowlist is complete, licensed, and byte-exact", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "vendor", "manifest.json"), "utf8")) as {
    artifacts: { license: string; path: string; sha256: string; source: string }[]
    schema: string
    sourceBaseline: string
  }
  const files = readdirSync(join(ROOT, "vendor"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(join(ROOT, "vendor"), join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .filter((path) => path !== "manifest.json")
    .sort()
  const declared = manifest.artifacts.map((artifact) => artifact.path).sort()

  assert.equal(manifest.schema, "cycle.vendor.v1")
  assert.match(manifest.sourceBaseline, /^Cycle for Claude Code@[a-f0-9]{40}$/u)
  assert.deepEqual(files, declared)
  assert.equal(files.length, 14)
  for (const artifact of manifest.artifacts) {
    assert.ok([".cjs", ".wasm"].includes(extname(artifact.path)), artifact.path)
    assert.equal(artifact.license, "MIT")
    assert.match(artifact.source, /^https:\/\/github\.com\/tree-sitter\//u)
    const bytes = readFileSync(join(ROOT, "vendor", artifact.path))
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, artifact.path)
  }
})

test("the parser uses only bundled files and contains no dynamic download path", () => {
  const source = [
    readFileSync(join(ROOT, "src", "intel", "parser.ts"), "utf8"),
    readFileSync(join(ROOT, "src", "intel", "pool.ts"), "utf8"),
    readFileSync(join(ROOT, "src", "intel", "worker.ts"), "utf8"),
  ].join("\n")
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|\bnpm\s+(?:install|add)\b|\bcurl\b|\bwget\b/u)
})
