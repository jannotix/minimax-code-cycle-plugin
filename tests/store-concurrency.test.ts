import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { test } from "node:test"

import { Database } from "../src/store/database.ts"

test("concurrent first opens converge on one schema without migration races", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "cycle-minimax-concurrent-store-"))
  const path = join(scratch, "cycle.db")
  const moduleUrl = pathToFileURL(join(process.cwd(), "dist", "store", "database.js")).href
  const source = [
    `import { Database } from ${JSON.stringify(moduleUrl)};`,
    "const database = new Database({ path: process.argv[1] });",
    "database.close();",
  ].join("\n")

  try {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => child(source, path)),
    )
    assert.deepEqual(
      [...new Set(results.map((result) => result.code))],
      [0],
      results.filter((result) => result.code !== 0).map((result) => result.stderr).join("\n---\n"),
    )
    const database = new Database({ path })
    assert.equal(database.schemaVersion, 7)
    database.close()
  } finally {
    rmSync(scratch, { force: true, recursive: true })
  }
})

function child(source: string, path: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolveChild, reject) => {
    const processChild = spawn(process.execPath, ["--input-type=module", "-e", source, path], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    })
    let stderr = ""
    processChild.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")))
    processChild.on("error", reject)
    processChild.on("close", (code) => resolveChild({ code, stderr }))
  })
}
