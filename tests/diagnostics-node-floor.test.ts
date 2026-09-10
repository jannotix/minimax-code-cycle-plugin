import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { test } from "node:test"

import { belowMinimumNode, minimumNode } from "../src/diagnostics.ts"

// The floor `engines` declares is a patch version, because the store is built on node:sqlite and
// that is unflagged only from 22.13.0. Comparing the major alone accepted every 22.x, so the doctor
// reported a healthy runtime on a Node where the store then failed to open — a diagnostic that
// passes and is contradicted by the thing it diagnoses.
test("the Node floor is compared through the patch, not the major", () => {
  for (const version of ["22.0.0", "22.12.0", "22.12.9", "21.99.99", "20.11.0"]) {
    assert.equal(belowMinimumNode(version, "22.13.0"), true, `${version} must be refused`)
  }
  for (const version of ["22.13.0", "22.13.1", "22.14.0", "23.0.0", "26.3.0"]) {
    assert.equal(belowMinimumNode(version, "22.13.0"), false, `${version} must be accepted`)
  }
})

test("a version neither side can read is refused rather than assumed adequate", () => {
  assert.equal(belowMinimumNode("", "22.13.0"), true)
  assert.equal(belowMinimumNode("not-a-version", "22.13.0"), true)
  assert.equal(belowMinimumNode("22.13.0", ""), true)
})

// One declaration, read where it is declared. Two copies of the same floor is exactly what let the
// manifest say 22.13.0 while the doctor went on accepting 22.0.
test("the floor the doctor enforces is the one the manifest declares", async () => {
  const manifest = JSON.parse(
    await readFile(join(dirname(import.meta.dirname), "package.json"), "utf8"),
  )
  const declared = String(manifest.engines.node).replace(/^[^\d]*/u, "")
  assert.equal(await minimumNode(), declared)
  assert.equal(belowMinimumNode(declared, await minimumNode()), false)
})
