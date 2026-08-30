import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { ROOT, sha256 } from "./artifact-manifest.mjs"

const output = join(ROOT, "sbom.cdx.json")
const vendor = JSON.parse(await readFile(join(ROOT, "vendor", "manifest.json"), "utf8"))
const plugin = JSON.parse(await readFile(join(ROOT, "plugin.json"), "utf8"))

const grouped = new Map()
for (const artifact of vendor.artifacts) {
  const key = artifact.source
  const current = grouped.get(key) ?? { artifacts: [], license: artifact.license, source: artifact.source }
  current.artifacts.push(artifact)
  grouped.set(key, current)
}

const document = {
  bomFormat: "CycloneDX",
  components: [...grouped.values()].map((component) => ({
    externalReferences: [{ type: "vcs", url: component.source }],
    hashes: component.artifacts.map((artifact) => ({ alg: "SHA-256", content: artifact.sha256 })),
    licenses: [{ license: { id: component.license } }],
    name: component.source.split("/").at(-1),
    properties: component.artifacts.map((artifact) => ({
      name: "cycle:artifact-path",
      value: `vendor/${artifact.path}`,
    })),
    scope: "required",
    type: "library",
  })),
  metadata: {
    component: {
      licenses: [{ license: { name: plugin.license } }],
      name: plugin.name,
      type: "application",
      version: plugin.version,
    },
    properties: [
      { name: "cycle:vendor-source-baseline", value: vendor.sourceBaseline },
      { name: "cycle:runtime-npm-dependencies", value: "0" },
    ],
  },
  specVersion: "1.5",
  version: 1,
}

const serialized = `${JSON.stringify(document, null, 2)}\n`
if (process.argv.includes("--check")) {
  const existing = await readFile(output, "utf8")
  if (sha256(existing) !== sha256(serialized)) throw new Error("sbom.cdx.json is stale; run npm run sbom")
  console.log(`SBOM verified: ${document.components.length} runtime components`)
} else {
  await writeFile(output, serialized, "utf8")
  console.log(`SBOM written: ${document.components.length} runtime components`)
}
