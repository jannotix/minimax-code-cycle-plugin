import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { ROOT, sha256 } from "./artifact-manifest.mjs"

const output = join(ROOT, "license-inventory.json")
const lock = JSON.parse(await readFile(join(ROOT, "package-lock.json"), "utf8"))
const vendor = JSON.parse(await readFile(join(ROOT, "vendor", "manifest.json"), "utf8"))
const source = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"))

const build = Object.entries(lock.packages)
  .filter(([path]) => path.startsWith("node_modules/"))
  .map(([path, item]) => ({
    license: item.license ?? "UNKNOWN",
    name: path.slice("node_modules/".length),
    scope: item.dev === true ? "development" : "runtime",
    version: item.version,
  }))
  .sort((left, right) => left.name.localeCompare(right.name))

const bundled = vendor.artifacts.map((item) => ({
  license: item.license,
  path: `vendor/${item.path}`,
  scope: "bundled-runtime",
  sha256: item.sha256,
  source: item.source,
}))

const document = {
  buildDependencies: build,
  bundledArtifacts: bundled,
  package: { license: source.license, name: source.name, version: source.version },
  runtimeNpmDependencies: [],
  schema: "cycle.license-inventory.v1",
}
const serialized = `${JSON.stringify(document, null, 2)}\n`

if (process.argv.includes("--check")) {
  const existing = await readFile(output, "utf8")
  if (sha256(existing) !== sha256(serialized)) {
    throw new Error("license-inventory.json is stale; run npm run licenses")
  }
  const unknown = [...build, ...bundled].filter((item) => item.license === "UNKNOWN")
  if (unknown.length > 0) throw new Error(`unknown licenses: ${unknown.map((item) => item.name ?? item.path).join(", ")}`)
  console.log(`License inventory verified: ${bundled.length} bundled, ${build.length} build-only`)
} else {
  await writeFile(output, serialized, "utf8")
  console.log(`License inventory written: ${bundled.length} bundled, ${build.length} build-only`)
}
