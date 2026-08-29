import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"
import { test } from "node:test"

import { assertFreezable, CandidateRefused } from "../src/evidence/candidate.ts"

test("freeze requires a commit and detects in-progress state in a linked worktree", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "cycle-minimax-worktree-"))
  const main = join(scratch, "main")
  const linked = join(scratch, "linked")
  mkdirSync(main)
  const git = (root: string, ...args: string[]): string =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim()

  try {
    git(main, "init", "--quiet")
    git(main, "config", "user.email", "fixture@example.invalid")
    git(main, "config", "user.name", "fixture")
    git(main, "config", "core.autocrlf", "false")
    await assert.rejects(() => assertFreezable(main), CandidateRefused)

    writeFileSync(join(main, "README.md"), "# fixture\n")
    git(main, "add", "README.md")
    git(main, "commit", "--quiet", "-m", "baseline")
    git(main, "worktree", "add", "--quiet", "--detach", linked, "HEAD")
    assert.match(await assertFreezable(linked), /^[a-f0-9]{40}$/u)

    const marker = git(linked, "rev-parse", "--git-path", "MERGE_HEAD")
    writeFileSync(isAbsolute(marker) ? marker : join(linked, marker), `${git(linked, "rev-parse", "HEAD")}\n`)
    await assert.rejects(() => assertFreezable(linked), /MERGE_HEAD/u)
  } finally {
    rmSync(scratch, { force: true, recursive: true })
  }
})
