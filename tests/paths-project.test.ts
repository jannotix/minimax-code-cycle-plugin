import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"

import { PathError, resolveDataDirectory } from "../src/paths.ts"
import { identifyProject } from "../src/project.ts"

test("project identity requires an explicit absolute directory and is stable", () => {
  const root = mkdtempSync(join(tmpdir(), "cycle-minimax-project-"))
  try {
    assert.throws(() => identifyProject("relative/project"), /absolute path/u)
    const first = identifyProject(resolve(root))
    const second = identifyProject(resolve(root))
    assert.equal(first.id, second.id)
    assert.equal(first.path, second.path)
    assert.match(first.id, /^[a-f0-9]{32}$/u)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("data paths are durable per-platform locations rather than plugin data", () => {
  assert.equal(
    resolveDataDirectory(undefined, { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "win32"),
    "C:\\Users\\u\\AppData\\Local\\Cycle for MiniMax Code",
  )
  assert.equal(
    resolveDataDirectory(undefined, { HOME: "/Users/u" }, "darwin"),
    "/Users/u/Library/Application Support/Cycle for MiniMax Code",
  )
  assert.equal(
    resolveDataDirectory(undefined, { HOME: "/home/u", XDG_DATA_HOME: "/var/data/u" }, "linux"),
    "/var/data/u/cycle-minimax",
  )
  assert.throws(() => resolveDataDirectory(undefined, {}, "win32"), PathError)
})

test("an explicit data directory wins", () => {
  assert.equal(resolveDataDirectory("./cycle-data"), resolve("./cycle-data"))
})
