import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"

import {
  managedAgentMarkdown,
  profileRelativePath,
  readInstalledProfile,
  type CycleRole,
} from "../src/setup.ts"

const ROLE: CycleRole = "executor"

function profileRoot(contents: string | null): string {
  const root = mkdtempSync(join(tmpdir(), "cycle-profile-"))
  if (contents !== null) {
    const path = join(root, profileRelativePath(ROLE))
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, contents, "utf8")
  }
  return root
}

const expected = (body = "the executor body"): string => managedAgentMarkdown(ROLE, body)

// The point of the whole change. Every fact about the installed profile used to come from the
// coordinator, including the text `assess` compared: a session that wrote nothing could hand back
// the expected bytes and be told `noop`. The plane reads the file itself now, so the claim and the
// disk have to agree.
test("a profile that was never written is not accepted because the caller says it was", async () => {
  const root = profileRoot(null)
  try {
    const found = await readInstalledProfile(root, ROLE)
    assert.equal(found, null, "no file means no profile, whatever the caller reports")
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("the bytes on disk are what is returned, not what was expected", async () => {
  const root = profileRoot("tools: [everything]\n")
  try {
    assert.equal(await readInstalledProfile(root, ROLE), "tools: [everything]\n")
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("a profile that matches is returned verbatim", async () => {
  const wanted = expected()
  const root = profileRoot(wanted)
  try {
    assert.equal(await readInstalledProfile(root, ROLE), wanted)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

// The read crosses out of the project into a directory the user named, so it is bounded the same way
// every other read in this plugin is: inside the root, no link crossed, size capped.
//
// A junction rather than a file symlink, because Windows refuses the latter without privileges —
// and because `O_NOFOLLOW` does not exist on Windows at all. What holds there is the lstat walk over
// every segment plus the realpath containment check, which is exactly what this proves.
test("the read does not cross a link out of the declared profile root", async () => {
  const root = mkdtempSync(join(tmpdir(), "cycle-profile-link-"))
  const outside = mkdtempSync(join(tmpdir(), "cycle-profile-outside-"))
  try {
    writeFileSync(join(outside, "agent.md"), expected(), "utf8")
    const agentDirectory = dirname(join(root, profileRelativePath(ROLE)))
    mkdirSync(dirname(agentDirectory), { recursive: true })
    symlinkSync(outside, agentDirectory, process.platform === "win32" ? "junction" : "dir")
    assert.notEqual(agentDirectory, realpathSync.native(agentDirectory), "the link must be real")
    assert.equal(await readInstalledProfile(root, ROLE), null, "a link out is not a profile")
  } finally {
    rmSync(root, { force: true, recursive: true })
    rmSync(outside, { force: true, recursive: true })
  }
})

test("a relative profile root is refused rather than resolved against the process", async () => {
  await assert.rejects(() => readInstalledProfile("agents", ROLE), /absolute/iu)
})
