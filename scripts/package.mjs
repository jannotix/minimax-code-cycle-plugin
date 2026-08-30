import { execFileSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

import { collect, fileRecords, ROOT, runtimePackage, sha256, violations } from "./artifact-manifest.mjs"
import { scan } from "./secret-scan.mjs"

const output = resolve(valueAfter("--output") ?? join(ROOT, "release"))
const source = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"))
const plugin = JSON.parse(await readFile(join(ROOT, "plugin.json"), "utf8"))
if (source.version !== plugin.version) throw new Error("package.json and plugin.json versions differ")

const paths = await collect()
const rejected = violations(paths)
if (rejected.length > 0) throw new Error(`artifact allowlist violation: ${JSON.stringify(rejected)}`)
const findings = await scan(paths)
if (findings.length > 0) throw new Error(`secret scan failed: ${JSON.stringify(findings)}`)

const records = await fileRecords(paths)
const stage = await mkdtemp(join(tmpdir(), "cycle-minimax-pack-"))
try {
  for (const path of paths) {
    await mkdir(dirname(join(stage, path)), { recursive: true })
    await copyFile(join(ROOT, path), join(stage, path))
  }
  const runtime = runtimePackage(source)
  await writeFile(join(stage, "package.json"), runtime, "utf8")
  const packagedRecords = [
    ...records.filter((record) => record.path !== "package.json"),
    { path: "package.json", sha256: sha256(runtime), size: Buffer.byteLength(runtime) },
  ].sort((left, right) => left.path.localeCompare(right.path))

  await mkdir(output, { recursive: true })
  const npm = npmCommand()
  const result = JSON.parse(
    execFileSync(npm.command, [...npm.prefix, "pack", "--json", "--ignore-scripts", "--pack-destination", output], {
      cwd: stage,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    }),
  )[0]
  const artifactName = result.filename
  const artifactPath = join(output, artifactName)
  const artifactBytes = await readFile(artifactPath)
  const artifactSha256 = sha256(artifactBytes)
  const commit = git(["rev-parse", "HEAD"]).trim()
  const treeState = git(["status", "--porcelain"]).trim() === "" ? "clean" : "dirty"
  if (process.argv.includes("--require-clean") && treeState !== "clean") {
    throw new Error("release packaging requires a clean Git worktree")
  }

  const manifestName = `${artifactName}.manifest.json`
  const manifest = {
    artifact: { name: artifactName, sha256: artifactSha256, size: artifactBytes.length },
    files: packagedRecords,
    package: { name: source.name, version: source.version },
    schema: "cycle.artifact-manifest.v1",
  }
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
  await writeFile(join(output, manifestName), manifestText, "utf8")
  await writeFile(join(output, `${artifactName}.sha256`), `${artifactSha256}  ${artifactName}\n`, "utf8")
  await writeFile(
    join(output, `${artifactName}.provenance.json`),
    `${JSON.stringify(
      {
        artifact: manifest.artifact,
        buildType: "npm-pack",
        builder: { node: process.version, npm: npmVersion() },
        manifest: { name: manifestName, sha256: sha256(manifestText) },
        schema: "cycle.provenance.v1",
        source: { commit, repository: source.repository.url, treeState },
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
  console.log(JSON.stringify({ artifact: artifactPath, files: packagedRecords.length, sha256: artifactSha256, treeState }))
} finally {
  await rm(stage, { force: true, recursive: true })
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

function npmVersion() {
  const npm = npmCommand()
  return execFileSync(npm.command, [...npm.prefix, "--version"], { encoding: "utf8" }).trim()
}

function npmCommand() {
  const cli = process.env["npm_execpath"] ?? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
  return { command: process.execPath, prefix: [cli] }
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}
