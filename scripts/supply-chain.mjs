import { execFileSync } from "node:child_process"
import { rm } from "node:fs/promises"
import { basename, join, resolve } from "node:path"

import { ROOT } from "./artifact-manifest.mjs"

const output = resolve(valueAfter("--output") ?? join(ROOT, "release"))
await rm(output, { force: true, recursive: true })
const packaging = execFileSync(
  process.execPath,
  [join(ROOT, "scripts", "package.mjs"), "--output", output, ...(process.argv.includes("--require-clean") ? ["--require-clean"] : [])],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], timeout: 180_000 },
).trim()
const result = JSON.parse(packaging.split(/\r?\n/u).at(-1))
const name = basename(result.artifact)
execFileSync(
  process.execPath,
  [
    join(ROOT, "scripts", "verify-package.mjs"),
    "--artifact", result.artifact,
    "--manifest", join(output, `${name}.manifest.json`),
    "--checksum", join(output, `${name}.sha256`),
    "--provenance", join(output, `${name}.provenance.json`),
    ...(process.argv.includes("--require-clean") ? ["--require-clean"] : []),
  ],
  { stdio: "inherit", timeout: 180_000 },
)
console.log(packaging)

function valueAfter(flag) {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}
