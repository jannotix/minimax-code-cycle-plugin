import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"

// @ts-expect-error dependency-free release scripts are checked through their public exports
import { collect, FORBIDDEN, ROOT, runtimePackage, violations } from "../scripts/artifact-manifest.mjs"
// @ts-expect-error dependency-free release scripts are checked through their public exports
import { findSecrets } from "../scripts/secret-scan.mjs"

const execFileAsync = promisify(execFile)

test("the package allowlist contains every runtime root and refuses development material", async () => {
  const paths = (await collect()) as string[]
  for (const required of [
    "plugin.json",
    "mcp.json",
    "dist/server.js",
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

// `npm pack` packs the working tree, so the published digest is only a property of the commit if the
// working tree is the same bytes everywhere. Without `eol=lf` in .gitattributes git checks text out
// as CRLF on Windows and LF elsewhere, and the artifact differed by the machine that packed it —
// the same failure the Skill archive had for a different reason, on the artifact people install.
//
// Checked on what the allowlist actually ships rather than on the attributes file, because a rule
// that stops matching is exactly the silent way this comes back.
test("no packaged text file carries a carriage return", async () => {
  const paths = (await collect()) as string[]
  const offenders: string[] = []
  for (const path of paths) {
    if (/\.(wasm|png|jpg|jpeg|gif|ico|zip|tgz)$/iu.test(path)) continue
    const bytes = await readFile(join(ROOT as string, path))
    // A NUL byte means this is not text, whatever its extension says.
    if (bytes.includes(0)) continue
    if (bytes.includes(Buffer.from("\r\n"))) offenders.push(path)
  }
  assert.deepEqual(offenders, [], `packed with CRLF: ${offenders.join(", ")}`)
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
  assert.match(verifier, /child\.on\("close"/u)
  assert.match(verifier, /await rm\(clean, \{ force: true, recursive: true \}\)/u)
  assert.match(skillPackager, /zipSync\(archiveEntries/u)
  // The stamp is built from local components, never from a fixed instant. An instant is rendered
  // through local getters and stops being fixed the moment the machine moves zone, which is what
  // the ISO literal that used to be pinned here was hiding. What the archive carries is asserted on
  // the bytes below rather than on the shape of the source, so this only keeps the instant out.
  assert.match(skillPackager, /new Date\(1980, 0, 1, 0, 0, 0, 0\)/u)
  assert.doesNotMatch(skillPackager, /mtime:\s*new Date\("/u)
  assert.match(skillPackager, /HEAD:skills\/cycle/u)
  assert.match(skillPackager, /unzipSync\(bytes\)/u)
})

test("the local Skill ZIP is byte-stable across two builds of the same commit", async () => {
  const source = JSON.parse(await readFile(join(ROOT as string, "package.json"), "utf8"))
  const first = await mkdtemp(join(tmpdir(), "cycle-skill-repro-a-"))
  const second = await mkdtemp(join(tmpdir(), "cycle-skill-repro-b-"))
  try {
    const args = [join(ROOT as string, "scripts", "package-local-skill.mjs")]
    await execFileAsync(process.execPath, [...args, "--output", first], { cwd: ROOT as string })
    await execFileAsync(process.execPath, [...args, "--output", second], { cwd: ROOT as string })
    const archiveName = `cycle-skill-${source.version}.zip`
    assert.deepEqual(
      await readFile(join(first, archiveName)),
      await readFile(join(second, archiveName)),
    )
    const provenance = JSON.parse(await readFile(join(first, `${archiveName}.provenance.json`), "utf8"))
    assert.equal(provenance.buildType, "deterministic-fflate-zip")
  } finally {
    await rm(first, { force: true, recursive: true })
    await rm(second, { force: true, recursive: true })
  }
})

// The two-build test above compares one machine against itself, which is how a reproducibility
// claim stays true of the comparison and false of the property. This reads the stamp the archive
// actually carries, so it fails anywhere the writer renders it in local time — which `fflate` does:
// it builds the DOS field from getFullYear, getMonth, getDate, getHours, getMinutes and getSeconds,
// every one of them local. Handed an instant that is midnight UTC, a machine at UTC+1 wrote 01:00
// and a machine west of UTC wrote 1979, below the year the format counts from, where the year field
// goes negative and wraps.
test("every archive entry is stamped 1980-01-01 00:00, in any timezone", async () => {
  const source = JSON.parse(await readFile(join(ROOT as string, "package.json"), "utf8"))
  const output = await mkdtemp(join(tmpdir(), "cycle-skill-stamp-"))
  try {
    await execFileAsync(
      process.execPath,
      [join(ROOT as string, "scripts", "package-local-skill.mjs"), "--output", output],
      { cwd: ROOT as string },
    )
    const bytes = await readFile(join(output, `cycle-skill-${source.version}.zip`))

    // Every local file header, not only the first: one entry written from a different instant is
    // the same defect with a smaller blast radius.
    let headers = 0
    for (let at = 0; at + 30 <= bytes.length; at += 1) {
      if (bytes.readUInt32LE(at) !== 0x04034b50) continue
      headers += 1
      const time = bytes.readUInt16LE(at + 10)
      const date = bytes.readUInt16LE(at + 12)
      assert.equal(date, 0x0021, `entry at ${at} is not stamped 1980-01-01`)
      assert.equal(time, 0x0000, `entry at ${at} is not stamped 00:00:00`)
    }
    assert.ok(headers > 0, "no local file header was found in the archive")
  } finally {
    await rm(output, { force: true, recursive: true })
  }
})

test("CI runs the core gate on Windows, macOS, and Linux at the Node floor", async () => {
  const workflow = await readFile(join(ROOT as string, ".github", "workflows", "ci.yml"), "utf8")
  const source = JSON.parse(await readFile(join(ROOT as string, "package.json"), "utf8"))
  for (const os of ["windows-latest", "macos-latest", "ubuntu-latest"]) assert.match(workflow, new RegExp(os, "u"))
  assert.match(workflow, /node-version: 22/u)
  assert.match(workflow, /npm ci --ignore-scripts/u)
  assert.match(workflow, /npm run check/u)

  // `engines` names the oldest Node the shipped runtime supports, and a floor nothing ever runs on
  // is a claim rather than a guarantee: a matrix pinned to a major installs the newest patch and
  // never meets the version the manifest promises. The exact floor must be pinned in the workflow
  // and the built store loaded on it, because `node:sqlite` is what sets the floor and refusing to
  // open is how a wrong one is discovered — by a user, otherwise.
  const floor = String(source.engines.node).replace(/^>=/u, "")
  assert.match(floor, /^\d+\.\d+\.\d+$/u)
  assert.match(workflow, new RegExp(`node-version: "${floor.replaceAll(".", "\\.")}"`, "u"))
  assert.match(workflow, /dist\/store\/database\.js/u)
  const actionUses = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s]+)/gu)].map((match) => match[1])
  assert.ok(actionUses.length >= 2)
  assert.ok(actionUses.every((revision) => /^[a-f0-9]{40}$/u.test(revision ?? "")))
})
