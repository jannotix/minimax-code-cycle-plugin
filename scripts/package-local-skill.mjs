import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"

import { unzipSync } from "fflate"

import { ROOT, sha256 } from "./artifact-manifest.mjs"
import { scan } from "./secret-scan.mjs"

const output = resolve(valueAfter("--output") ?? join(ROOT, "release"))
const source = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"))
const treeState = git(["status", "--porcelain"]).trim() === "" ? "clean" : "dirty"
if (process.argv.includes("--require-clean") && treeState !== "clean") {
  throw new Error("local Skill packaging requires a clean Git worktree")
}

const files = await walk(join(ROOT, "skills", "cycle"))
const sourcePaths = files.map((path) => normalize(relative(ROOT, path))).sort()
const findings = await scan(sourcePaths)
if (findings.length > 0) throw new Error(`local Skill secret scan failed: ${JSON.stringify(findings)}`)
const archivePaths = sourcePaths.map((sourcePath) => sourcePath.replace(/^skills\/cycle\//u, ""))

await mkdir(output, { recursive: true })
const artifactName = `cycle-skill-${source.version}.zip`
const artifactPath = join(output, artifactName)
git(["archive", "--format=zip", `--output=${artifactPath}`, "HEAD:skills/cycle"])
const bytes = await readFile(artifactPath)
const digest = sha256(bytes)
const unpacked = unzipSync(bytes)
const listed = Object.keys(unpacked).filter((path) => !path.endsWith("/")).sort()
const expected = [...archivePaths].sort()
if (JSON.stringify(listed) !== JSON.stringify(expected)) throw new Error("local Skill ZIP listing differs from source")
for (const required of ["SKILL.md", "setup/PROCEDURE.md", "coordinator/FLOW.md", "coordinator/ROLE_DISPATCH.md"]) {
  if (!listed.includes(required)) throw new Error(`local Skill ZIP is missing ${required}`)
}

const records = archivePaths.map((path) => {
  const extracted = unpacked[path]
  if (extracted === undefined) throw new Error(`local Skill ZIP omitted ${path}`)
  const committed = gitBytes(["show", `HEAD:skills/cycle/${path}`])
  if (!sourceEquivalent(extracted, committed)) throw new Error(`local Skill extracted file differs: ${path}`)
  return { path, sha256: sha256(extracted), size: extracted.length }
})

const manifestName = `${artifactName}.manifest.json`
const manifestText = `${JSON.stringify({
  artifact: { name: artifactName, sha256: digest, size: bytes.length },
  files: records,
  package: { name: "cycle", version: source.version },
  schema: "cycle.local-skill-manifest.v1",
}, null, 2)}\n`
await writeFile(join(output, manifestName), manifestText, "utf8")
await writeFile(join(output, `${artifactName}.sha256`), `${digest}  ${artifactName}\n`, "utf8")
await writeFile(join(output, `${artifactName}.provenance.json`), `${JSON.stringify({
  artifact: { name: artifactName, sha256: digest, size: bytes.length },
  buildType: "git-archive-zip",
  manifest: { name: manifestName, sha256: sha256(manifestText) },
  schema: "cycle.provenance.v1",
  source: { commit: git(["rev-parse", "HEAD"]).trim(), repository: source.repository.url, treeState },
}, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ artifact: artifactPath, files: records.length, sha256: digest, treeState, verified: true }))

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

function gitBytes(args) {
  return execFileSync("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] })
}

// Git archive applies the checkout EOL filter on Windows. The manifest binds the exported bytes,
// while this comparison proves their LF-normalized text is the committed blob. Binary content must
// remain byte-exact and is never normalized.
function sourceEquivalent(exported, committed) {
  const exportedBuffer = Buffer.from(exported)
  if (Buffer.compare(exportedBuffer, committed) === 0) return true
  if (exportedBuffer.includes(0) || committed.includes(0)) return false
  const normalized = Buffer.from(exportedBuffer.toString("utf8").replaceAll("\r\n", "\n"), "utf8")
  return Buffer.compare(normalized, committed) === 0
}

async function walk(directory, into = []) {
  const { readdir } = await import("node:fs/promises")
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) await walk(full, into)
    else if (entry.isFile()) into.push(full)
    else throw new Error(`local Skill source refuses non-regular path: ${full}`)
  }
  return into
}

function normalize(path) {
  return path.split(sep).join("/")
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}
