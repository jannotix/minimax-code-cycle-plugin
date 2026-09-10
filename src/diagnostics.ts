import { readFile } from "node:fs/promises"
import { join } from "node:path"

import type { Runtime } from "./runtime.ts"
import { containsPath } from "./paths.ts"
import { identifyProject } from "./project.ts"
import { keyPermissions, verifyCheckpoints } from "./store/checkpoints.ts"
import { graphSize } from "./store/graph.ts"
import { verifyHistory } from "./store/history.ts"
import { CURRENT_SCHEMA_VERSION } from "./store/migrations.ts"

/**
 * The floor is a patch version, not a major one: the store is built on `node:sqlite`, which is
 * unflagged only from 22.13.0. Comparing the major alone accepted 22.0 through 22.12, where the
 * doctor reported a healthy runtime and the store then failed to open — a diagnostic that passes
 * and is contradicted by the thing it diagnoses.
 *
 * Read from `package.json` rather than written here a second time, because two declarations of one
 * floor is what let `engines` say 22.13.0 while this went on accepting 22.0.
 */
const FALLBACK_MINIMUM_NODE = "22.13.0"

export interface DiagnosticFinding {
  readonly code: string
  readonly message: string
  readonly severity: "error" | "warn"
}

/** The floor `engines` declares, or the last-known one if the manifest cannot be read. */
export async function minimumNode(): Promise<string> {
  try {
    const manifest = join(import.meta.dirname, "..", "package.json")
    const declared: unknown = JSON.parse(await readFile(manifest, "utf8")).engines?.node
    return /\d+(?:\.\d+){0,2}/u.exec(String(declared ?? ""))?.[0] ?? FALLBACK_MINIMUM_NODE
  } catch {
    return FALLBACK_MINIMUM_NODE
  }
}

/** Major, minor and patch, so a floor of 22.13.0 is not satisfied by 22.0. */
export function belowMinimumNode(version: string, floor: string): boolean {
  const parts = (value: string): number[] => {
    const found = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/u.exec(value)
    if (found === null) return []
    return [found[1], found[2], found[3]].map((part) => Number(part ?? 0))
  }

  const running = parts(version)
  const required = parts(floor)
  // A version this cannot read is reported rather than assumed adequate: unknown is not healthy.
  if (running.length === 0 || required.length === 0) return true

  for (const [index, needed] of required.entries()) {
    const have = running[index] ?? 0
    if (have !== needed) return have < needed
  }
  return false
}

export async function diagnose(runtime: Runtime, projectRoot: string, version: string): Promise<unknown> {
  const project = identifyProject(projectRoot)
  const findings: DiagnosticFinding[] = []

  for (const message of runtime.configuration.invalid) {
    findings.push({ code: "config.invalid", message, severity: "error" })
  }

  const floor = await minimumNode()
  if (belowMinimumNode(process.versions.node, floor)) {
    findings.push({
      code: "runtime.node",
      message:
        `Node ${process.versions.node} is below the required ${floor}. The store is built on ` +
        "node:sqlite, which is unflagged only from that version, so it will not open.",
      severity: "error",
    })
  }

  if (containsPath(project.path, runtime.dataDirectory)) {
    findings.push({
      code: "storage.inside_project",
      message: "the durable data directory must be outside project_root",
      severity: "error",
    })
    return report(runtime, project.id, version, findings, null)
  }

  const database = runtime.store()
  if (database === undefined) {
    findings.push({
      code: "store.open",
      message: runtime.storeFailure()?.message ?? "the store is unavailable",
      severity: "error",
    })
    return report(runtime, project.id, version, findings, null)
  }

  if (database.mode === "safe_read_only") {
    findings.push({
      code: "store.newer",
      message: `store schema ${database.schemaVersion} is newer than supported schema ${CURRENT_SCHEMA_VERSION}`,
      severity: "error",
    })
  }

  const chain = verifyHistory(database)
  if (!chain.valid) {
    findings.push({
      code: "history.chain",
      message: `history failed at sequence ${chain.sequence}: ${chain.reason}`,
      severity: "error",
    })
  }

  const checkpoints = verifyCheckpoints(database)
  if (!checkpoints.valid) {
    findings.push({
      code: "history.checkpoint",
      message: `checkpoint failed at sequence ${checkpoints.sequence}: ${checkpoints.reason}`,
      severity: "error",
    })
  }

  const permissions = keyPermissions(runtime.dataDirectory)
  if (permissions.exists && !permissions.restricted) {
    findings.push({
      code: "history.key_permissions",
      message: `the checkpoint key is not restricted: ${permissions.detail}`,
      severity: "error",
    })
  }

  const entries = database.get<{ total: number }>("select count(*) as total from history")?.total ?? 0
  if (entries > 0 && checkpoints.valid && checkpoints.checked === 0) {
    findings.push({
      code: "history.unsigned",
      message: "history has entries but no signed checkpoint yet",
      severity: "warn",
    })
  }

  const resources = await runtime.resources()
  const admission = runtime.admission.report(database, project.id, resources) as {
    pressure: string | null
  }
  if (admission.pressure !== null) {
    findings.push({ code: "admission.pressure", message: admission.pressure, severity: "warn" })
  }
  const memoryRow = database.get<{ current: number | null; total: number }>(
    `select count(*) as total,
            sum(case when state = 'current' then 1 else 0 end) as current
       from memory where project_id = ?`,
    project.id,
  )
  const goalRow = database.get<{ active: number | null; total: number }>(
    `select count(*) as total,
            sum(case when state not in ('aborted', 'completed') then 1 else 0 end) as active
       from goals where project_id = ?`,
    project.id,
  )

  return report(runtime, project.id, version, findings, {
    admission,
    chain,
    checkpoints,
    goals: { active: Number(goalRow?.active ?? 0), total: Number(goalRow?.total ?? 0) },
    graph: graphSize(database, project.id),
    historyEntries: entries,
    keyPermissions: permissions,
    memory: { current: Number(memoryRow?.current ?? 0), total: Number(memoryRow?.total ?? 0) },
    mode: database.mode,
    schemaVersion: database.schemaVersion,
  })
}

function report(
  runtime: Runtime,
  projectId: string,
  version: string,
  findings: readonly DiagnosticFinding[],
  store: unknown,
): unknown {
  return {
    configuration: {
      dataDirectorySource: runtime.dataDirectorySource,
      gateStrictness: runtime.configuration.gateStrictness,
      invalid: runtime.configuration.invalid,
      maxRepairCycles: runtime.configuration.maxRepairCycles,
      securityProofs: runtime.configuration.securityProofs,
    },
    findings,
    ok: !findings.some((finding) => finding.severity === "error"),
    projectId,
    runtime: { arch: process.arch, node: process.versions.node, platform: process.platform },
    store,
    version,
  }
}
