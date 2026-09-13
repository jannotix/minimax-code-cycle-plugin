import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { containmentOf, treeFingerprint } from "../src/evidence/containment.ts"

const git = (root: string, ...args: string[]): void => {
  execFileSync("git", ["-c", "core.hooksPath=", "-C", root, ...args], { stdio: "ignore" })
}

const scratch = (): string => {
  const root = mkdtempSync(join(tmpdir(), "cycle-containment-"))
  git(root, "init", "-q")
  git(root, "config", "user.email", "t@example.test")
  git(root, "config", "user.name", "t")
  writeFileSync(join(root, "kept.txt"), "one\n")
  git(root, "add", "-A")
  git(root, "commit", "-q", "-m", "base")
  return root
}

test("the plane can tell whether a read-only role changed the tree", async () => {
  const root = scratch()
  try {
    // The guarantee this replaces is unprovable here: MiniMax exposes no record of a child
    // session's tool roster, so "the reviewer could not write" cannot be established. What can be
    // established is whether a write happened, and that is what the plane checks.
    const bound = await treeFingerprint(root)
    assert.ok(bound !== null)
    assert.equal(bound!.length, 64)

    // Nothing happened: the same tree fingerprints the same, twice running.
    assert.deepEqual(await containmentOf(root, bound), { fingerprint: bound, state: "held" })

    // A new file is a change.
    writeFileSync(join(root, "added.txt"), "two\n")
    const added = await containmentOf(root, bound)
    assert.equal(added.state, "violated")

    rmSync(join(root, "added.txt"))
    assert.equal((await containmentOf(root, bound)).state, "held")

    // An in-place edit that keeps the byte count is a change too: the fingerprint carries each
    // file's digest, not just its path, so a same-size rewrite cannot pass as an untouched tree.
    writeFileSync(join(root, "kept.txt"), "two\n")
    const edited = await containmentOf(root, bound)
    assert.equal(edited.state, "violated")
    assert.equal(Buffer.byteLength("two\n"), Buffer.byteLength("one\n"))

    // Committing the change does not launder it: the tree moves from dirty to clean and the
    // fingerprint moves with it.
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "edit")
    assert.equal((await containmentOf(root, bound)).state, "held", "clean tree matches clean bound")
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

// No git repository is created here, on purpose. Both cases are about the plane refusing to call an
// unestablished fact a clean one, and neither needs a repo — which keeps this file's git load down.
// That load is not free: `probeVersion` in exec.test.ts gives git 4 seconds, and on a loaded Windows
// machine the git calls in this file are what push it past that.
test("an unestablished fact is never reported as a clean one", async () => {
  const notARepository = mkdtempSync(join(tmpdir(), "cycle-nogit-"))
  try {
    // No fingerprint at binding means the plane cannot say. That is `unknown`, and a caller that
    // treats it as a pass is claiming something nobody checked — the exact failure this product
    // exists to refuse.
    const missing = await containmentOf(notARepository, undefined)
    assert.equal(missing.state, "unknown")
    assert.match(missing.reason, /no tree fingerprint/u)

    // Somewhere git cannot describe is also unknown, not clean.
    assert.equal(await treeFingerprint(notARepository), null)
    const unreadable = await containmentOf(notARepository, "0".repeat(64))
    assert.equal(unreadable.state, "unknown")
    assert.match(unreadable.reason, /could not describe/u)
  } finally {
    rmSync(notARepository, { force: true, recursive: true })
  }
})
