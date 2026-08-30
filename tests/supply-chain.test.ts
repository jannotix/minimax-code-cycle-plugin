import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"

// @ts-expect-error dependency-free release scripts are checked through their public exports
import { collect, FORBIDDEN, ROOT, runtimePackage, violations } from "../scripts/artifact-manifest.mjs"
// @ts-expect-error dependency-free release scripts are checked through their public exports
import { findSecrets } from "../scripts/secret-scan.mjs"

test("the package allowlist contains every runtime root and refuses development material", async () => {
  const paths = (await collect()) as string[]
  for (const required of [
    "plugin.json",
    "mcp.json",
    "dist/server.js",
    "scripts/freeze-candidate.mjs",
    "scripts/verify-audit.mjs",
    "skills/cycle/SKILL.md",
    "skills/cycle/setup/manifest.json",
    "vendor/manifest.json",
    "LICENSE",
    "NOTICE",
    "THIRD-PARTY-NOTICES.md",
    "sbom.cdx.json",
    "license-inventory.json",
    "SECURITY.md",
  ]) assert.ok(paths.includes(required), `missing ${required}`)
  assert.equal(violations(paths).length, 0)
  assert.equal(paths.some((path) => path.startsWith("src/") || path.startsWith("tests/")), false)

  const samples = [
    "src/server.ts",
    "dist/server.js.map",
    "tests/a.test.js",
    "tsconfig.json",
    "package-lock.json",
    "node_modules/a/index.js",
    ".git/config",
    "private.pem",
    "scripts/package.mjs",
  ]
  const reached = new Set(samples.flatMap((path) => violations([path]).map((item: { reason: string }) => item.reason)))
  assert.equal(reached.size, (FORBIDDEN as unknown[]).length)
})

test("the shipped package metadata has no install scripts or dependency tree", async () => {
  const source = JSON.parse(await readFile(join(ROOT as string, "package.json"), "utf8"))
  const runtime = JSON.parse(runtimePackage(source) as string)
  assert.equal(runtime.type, "module")
  assert.equal(runtime.version, source.version)
  assert.equal(runtime.scripts, undefined)
  assert.equal(runtime.dependencies, undefined)
  assert.equal(runtime.devDependencies, undefined)
})

test("SBOM, license inventory, and notices cover every bundled byte", async () => {
  const vendor = JSON.parse(await readFile(join(ROOT as string, "vendor", "manifest.json"), "utf8"))
  const sbom = JSON.parse(await readFile(join(ROOT as string, "sbom.cdx.json"), "utf8"))
  const licenses = JSON.parse(await readFile(join(ROOT as string, "license-inventory.json"), "utf8"))
  const notices = await readFile(join(ROOT as string, "THIRD-PARTY-NOTICES.md"), "utf8")
  const sbomHashes = new Set(
    sbom.components.flatMap((component: { hashes: { content: string }[] }) => component.hashes.map((hash) => hash.content)),
  )
  const inventoryHashes = new Set(
    licenses.bundledArtifacts.map((artifact: { sha256: string }) => artifact.sha256),
  )
  for (const artifact of vendor.artifacts) {
    assert.ok(sbomHashes.has(artifact.sha256), `SBOM omits ${artifact.path}`)
    assert.ok(inventoryHashes.has(artifact.sha256), `license inventory omits ${artifact.path}`)
    assert.match(notices, new RegExp(artifact.source.split("/").at(-1).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"))
  }
  assert.deepEqual(licenses.runtimeNpmDependencies, [])
  assert.ok(licenses.buildDependencies.every((item: { license: string }) => item.license !== "UNKNOWN"))
})

test("the release secret scan detects high-confidence credential shapes", () => {
  assert.deepEqual(findSecrets("ordinary plugin text"), [])
  assert.ok(findSecrets(`key=${"AKIA"}${"A".repeat(16)}`).includes("AWS access key"))
  assert.ok(findSecrets(`token=${"ghp_"}${"b".repeat(40)}`).includes("GitHub token"))
  assert.ok(findSecrets(`-----BEGIN ${"PRIVATE KEY"}-----`).includes("private key"))
})

test("the supply-chain verifier uses npm pack and an external tar reader", async () => {
  const packager = await readFile(join(ROOT as string, "scripts", "package.mjs"), "utf8")
  const skillPackager = await readFile(join(ROOT as string, "scripts", "package-local-skill.mjs"), "utf8")
  const verifier = await readFile(join(ROOT as string, "scripts", "verify-package.mjs"), "utf8")
  assert.match(packager, /"pack", "--json", "--ignore-scripts"/u)
  assert.doesNotMatch(packager, /package-skill|createTar|tar writer/iu)
  assert.match(verifier, /spawnSync\(candidate, \["--version"\]/u)
  assert.match(verifier, /"-tzf"/u)
  assert.match(verifier, /provenance does not bind the canonical artifact/u)
  assert.match(verifier, /method: "initialize"/u)
  assert.match(verifier, /method: "tools\/list"/u)
  assert.match(skillPackager, /"archive", "--format=zip"/u)
  assert.match(skillPackager, /HEAD:skills\/cycle/u)
  assert.match(skillPackager, /unzipSync\(bytes\)/u)
})

test("CI runs the core gate on Windows, macOS, and Linux at the Node floor", async () => {
  const workflow = await readFile(join(ROOT as string, ".github", "workflows", "ci.yml"), "utf8")
  for (const os of ["windows-latest", "macos-latest", "ubuntu-latest"]) assert.match(workflow, new RegExp(os, "u"))
  assert.match(workflow, /node-version: 22/u)
  assert.match(workflow, /npm ci --ignore-scripts/u)
  assert.match(workflow, /npm run check/u)
  const actionUses = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s]+)/gu)].map((match) => match[1])
  assert.ok(actionUses.length >= 2)
  assert.ok(actionUses.every((revision) => /^[a-f0-9]{40}$/u.test(revision ?? "")))
})
