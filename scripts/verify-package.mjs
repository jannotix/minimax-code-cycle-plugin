import { spawn, spawnSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { sha256, violations } from "./artifact-manifest.mjs"

const artifact = resolve(requiredValue("--artifact"))
const manifestPath = resolve(requiredValue("--manifest"))
const checksumPath = resolve(requiredValue("--checksum"))
const provenancePath = resolve(requiredValue("--provenance"))
const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
const provenance = JSON.parse(await readFile(provenancePath, "utf8"))
const bytes = await readFile(artifact)
const digest = sha256(bytes)
if (digest !== manifest.artifact.sha256) throw new Error("artifact hash differs from manifest")
const checksum = (await readFile(checksumPath, "utf8")).trim().split(/\s+/u)[0]
if (digest !== checksum) throw new Error("artifact hash differs from checksum sidecar")
if (provenance.schema !== "cycle.provenance.v1" || provenance.artifact.sha256 !== digest) {
  throw new Error("provenance does not bind the canonical artifact")
}
const manifestDigest = sha256(await readFile(manifestPath))
if (provenance.manifest.sha256 !== manifestDigest) throw new Error("provenance does not bind the manifest")
if (!/^[a-f0-9]{40}$/u.test(provenance.source.commit)) throw new Error("provenance has no exact Git commit")
if (!["clean", "dirty"].includes(provenance.source.treeState)) throw new Error("invalid provenance tree state")
if (process.argv.includes("--require-clean") && provenance.source.treeState !== "clean") {
  throw new Error("release provenance is not clean")
}

const reader = tarReader()
const listed = run(reader, ["-tzf", artifact])
  .split(/\r?\n/u)
  .map((line) => line.replace(/^\.\//u, "").trim())
  .filter((line) => line !== "" && !line.endsWith("/"))
const normalized = listed.map((path) => path.replace(/^package\//u, "")).sort()
const expected = manifest.files.map((entry) => entry.path).sort()
if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
  throw new Error(`archive listing differs from manifest\nexpected=${JSON.stringify(expected)}\nactual=${JSON.stringify(normalized)}`)
}
const rejected = violations(normalized)
if (rejected.length > 0) throw new Error(`forbidden archive entry: ${JSON.stringify(rejected)}`)

const clean = await mkdtemp(join(tmpdir(), "cycle-minimax-verify-"))
try {
  run(reader, ["-xzf", artifact, "-C", clean])
  const root = join(clean, "package")
  for (const record of manifest.files) {
    const extracted = await readFile(join(root, record.path))
    if (extracted.length !== record.size || sha256(extracted) !== record.sha256) {
      throw new Error(`extracted file differs: ${record.path}`)
    }
  }
  const runtime = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
  if (runtime.scripts !== undefined || runtime.dependencies !== undefined || runtime.devDependencies !== undefined) {
    throw new Error("runtime package contains install or development behavior")
  }
  const initialized = await rpc(join(root, "dist", "server.js"), {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: { protocolVersion: "2025-06-18" },
  })
  if (initialized.result?.serverInfo?.version !== runtime.version) throw new Error("extracted server version mismatch")
  const tools = await rpc(join(root, "dist", "server.js"), { id: 2, jsonrpc: "2.0", method: "tools/list" })
  if (!Array.isArray(tools.result?.tools) || !tools.result.tools.some((tool) => tool.name === "cycle_coordinator")) {
    throw new Error("extracted MCP server did not expose cycle_coordinator")
  }
  console.log(JSON.stringify({ digest, extracted: clean, files: normalized.length, server: runtime.version, status: "verified" }))
} finally {
  await rm(clean, { force: true, recursive: true })
}

function tarReader() {
  const candidates = process.platform === "win32"
    ? [join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "tar.exe"), "tar"]
    : ["tar", "/usr/bin/bsdtar"]
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" })
    if (probe.status === 0) return candidate
  }
  throw new Error("an independent tar reader is required")
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 120_000 })
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`)
  return result.stdout
}

async function rpc(server, request) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [server], { cwd: join(server, "..", ".."), stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let response
    let responseError
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, 15_000)
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
      const line = stdout.split(/\r?\n/u).find((candidate) => candidate.trim() !== "")
      if (line === undefined || response !== undefined || responseError !== undefined) return
      try {
        response = JSON.parse(line)
      } catch (error) {
        responseError = error instanceof Error ? error : new Error(String(error))
      }
      child.kill()
    })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", (error) => { clearTimeout(timer); reject(error) })
    child.on("close", () => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`extracted server timed out: ${stderr}`))
      } else if (responseError !== undefined) {
        reject(responseError)
      } else if (response !== undefined) {
        resolvePromise(response)
      } else {
        reject(new Error(`extracted server exited before a response: ${stderr}`))
      }
    })
    child.stdin.end(`${JSON.stringify(request)}\n`)
  })
}

function requiredValue(flag) {
  const index = process.argv.indexOf(flag)
  const value = index === -1 ? undefined : process.argv[index + 1]
  if (value === undefined) throw new Error(`missing ${flag}`)
  return value
}
