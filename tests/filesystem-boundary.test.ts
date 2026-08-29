import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import {
  digestContainedFile,
  readContainedFile,
  safeWritePath,
  UnsafeWorkspacePath,
} from "../src/filesystem.ts"

test("candidate reads and delivery writes refuse traversal, symlinks, and junctions", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "cycle-minimax-path-boundary-"))
  const root = join(scratch, "root")
  const outside = join(scratch, "outside")
  mkdirSync(root)
  mkdirSync(outside)
  writeFileSync(join(root, "regular.txt"), "inside")
  writeFileSync(join(outside, "secret.txt"), "outside")
  symlinkSync(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir")

  try {
    assert.equal((await readContainedFile(root, "regular.txt", 100))?.toString("utf8"), "inside")
    assert.match(await digestContainedFile(root, "regular.txt") ?? "", /^[a-f0-9]{64}$/u)
    assert.equal(await readContainedFile(root, "linked/secret.txt", 100), null)
    assert.equal(await digestContainedFile(root, "linked/secret.txt"), null)
    await assert.rejects(() => safeWritePath(root, "linked/secret.txt"), UnsafeWorkspacePath)
    await assert.rejects(() => safeWritePath(root, "../escape.txt"), UnsafeWorkspacePath)
    await assert.rejects(() => safeWritePath(root, join(outside, "secret.txt")), UnsafeWorkspacePath)
  } finally {
    rmSync(scratch, { force: true, recursive: true })
  }
})
