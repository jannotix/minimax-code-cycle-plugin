import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { ROOT } from "./artifact-manifest.mjs"

const mapping = JSON.parse(await readFile(join(ROOT, "requirements.json"), "utf8"))
if (mapping.schema !== "cycle.requirements.v1" || !Array.isArray(mapping.requirements)) {
  throw new Error("invalid requirements mapping")
}
const ids = new Set()
for (const requirement of mapping.requirements) {
  if (!/^T0[0-6]-[A-Z0-9-]+$/u.test(requirement.id)) throw new Error(`invalid requirement id: ${requirement.id}`)
  if (ids.has(requirement.id)) throw new Error(`duplicate requirement id: ${requirement.id}`)
  ids.add(requirement.id)
  if (!Array.isArray(requirement.evidence) || requirement.evidence.length === 0) {
    throw new Error(`${requirement.id} has no executable evidence`)
  }
  for (const evidence of requirement.evidence) {
    if (!/^tests\/[a-z0-9-]+\.test\.(?:ts|mjs)$/u.test(evidence.file)) {
      throw new Error(`${requirement.id} points outside the executable suite`)
    }
    const source = await readFile(join(ROOT, evidence.file), "utf8")
    if (!source.includes(`test("${evidence.test}"`)) {
      throw new Error(`${requirement.id} names a test that does not exist: ${evidence.test}`)
    }
  }
}
for (const task of ["T00", "T01", "T02", "T03", "T04", "T05", "T06"]) {
  if (![...ids].some((id) => id.startsWith(`${task}-`))) throw new Error(`${task} has no mapped requirement`)
}
console.log(`Requirement map verified: ${ids.size} requirements, T00-T06 covered`)
