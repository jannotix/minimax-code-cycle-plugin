import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { execFileSync } from "node:child_process"
import { test } from "node:test"

import { requiredMissingGates } from "../src/evidence/required.ts"
import { reachOf } from "../src/evidence/reach.ts"
import { indexProject } from "../src/intel/indexer.ts"
import { ParsePool } from "../src/intel/pool.ts"
import { Database } from "../src/store/database.ts"

const PROJECT = "reach-project"
const pool = new ParsePool(2)
test.after(() => pool.dispose())

async function indexed(files: Record<string, string>): Promise<{ close: () => void; database: Database }> {
  const root = mkdtempSync(join(tmpdir(), "cycle-reach-"))
  execFileSync("git", ["init", "--quiet"], { cwd: root, stdio: "ignore" })
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, content, "utf8")
  }
  const database = new Database({ path: ":memory:" })
  await indexProject(database, PROJECT, root, { pool })
  return {
    close: () => {
      database.close()
      rmSync(root, { force: true, recursive: true })
    },
    database,
  }
}

// The property the whole feature exists for: a change to a file nobody edited under `auth` still
// pulls the security surface in, because something under `auth` consumes it.
test("a change reaches the files that consume it, without touching them", async () => {
  const item = await indexed({
    "src/auth/session.ts": `import { setting } from "../config.ts"\nexport function session() { return setting() }`,
    "src/config.ts": `export function setting() { return 1 }`,
    "src/unrelated.ts": `export function elsewhere() { return 2 }`,
  })
  try {
    const reach = reachOf(item.database, PROJECT, ["src/config.ts"])
    assert.equal(reach.confidence, "resolved")
    assert.ok(reach.paths.includes("src/auth/session.ts"), JSON.stringify(reach))
    assert.equal(reach.paths.includes("src/config.ts"), false, "a touched file is not a reached one")
    assert.equal(reach.paths.includes("src/unrelated.ts"), false)
  } finally {
    item.close()
  }
})

// "I cannot tell what is affected" and "nothing is affected" are different claims, and reporting the
// first as the second is the failure this is built to avoid.
test("an unindexed project is unresolved, not empty", async () => {
  const database = new Database({ path: ":memory:" })
  try {
    const reach = reachOf(database, PROJECT, ["src/config.ts"])
    assert.equal(reach.confidence, "unresolved")
    assert.equal(reach.paths.length, 0)
    // The reason must name the command that fixes it: a reader cannot act on "unknown".
    assert.match(reach.reason ?? "", /index/iu)
  } finally {
    database.close()
  }
})

test("a changed file the index does not hold leaves the reach unresolved", async () => {
  const item = await indexed({ "src/a.ts": `export function alpha() { return 1 }` })
  try {
    const reach = reachOf(item.database, PROJECT, ["src/a.ts", "src/never-indexed.ts"])
    assert.equal(reach.confidence, "unresolved")
    assert.match(reach.reason ?? "", /never-indexed\.ts/u)
  } finally {
    item.close()
  }
})

// A file in a language with no grammar was never modelled. That is not a gap in coverage the graph
// should have had, so it is reported separately from uncertainty.
test("files outside the model are named, and do not make the reach unknown", async () => {
  const item = await indexed({
    "README.md": "# not code",
    "src/a.ts": `export function alpha() { return 1 }`,
  })
  try {
    const reach = reachOf(item.database, PROJECT, ["src/a.ts", "README.md"])
    assert.equal(reach.confidence, "resolved")
    assert.deepEqual(reach.outside, ["README.md"])
  } finally {
    item.close()
  }
})

// Promote-only by construction: the reached set can insert a gate and has no way to remove one. A
// reach that is wrong costs a proof nobody needed, never one that was needed.
test("a touched file is never removed from what the rules are matched against", async () => {
  const item = await indexed({ "src/a.ts": `export function alpha() { return 1 }` })
  try {
    const reach = reachOf(item.database, PROJECT, ["src/a.ts"])
    assert.equal(reach.confidence, "resolved")
    assert.equal(reach.paths.includes("src/a.ts"), false)
    assert.equal(reach.truncated, false)
  } finally {
    item.close()
  }
})

// The reach is only worth having if it changes the evidence surface. A change to a file that no
// rule matches, consumed by one that several do, must pull those gates in — and a touched file can
// never be removed from the set, so the reach can add a proof and never take one away.
test("a rule fires on a file the change reaches but never touched", () => {
  const changed = [{ digest: null, kind: "modified", path: "src/config.ts" }] as never

  const withoutReach = requiredMissingGates(changed, [], "standard", [])
  const withReach = requiredMissingGates(changed, [], "standard", [], ["migrations/001_add_column.sql"])

  const names = (gates: readonly { name: string }[]): string[] => gates.map((gate) => gate.name).sort()
  assert.equal(
    names(withoutReach).includes("database:real-integration"),
    false,
    "nothing under migrations was touched",
  )
  assert.ok(
    names(withReach).includes("database:real-integration"),
    "a reached migration requires the proof anyway",
  )

  // Promote-only: every gate the touched set produced is still there.
  for (const gate of names(withoutReach)) assert.ok(names(withReach).includes(gate), gate)
})
