import { isAbsolute, relative } from "node:path"

import type { Runtime } from "./runtime.ts"
import { identifyProject } from "./project.ts"
import { keyPermissions, verifyCheckpoints } from "./store/checkpoints.ts"
import { verifyHistory } from "./store/history.ts"
import { CURRENT_SCHEMA_VERSION } from "./store/migrations.ts"

export interface DiagnosticFinding {
  readonly code: string
  readonly message: string
  readonly severity: "error" | "warn"
}

export async function diagnose(runtime: Runtime, projectRoot: string, version: string): Promise<unknown> {
  const project = identifyProject(projectRoot)
  const findings: DiagnosticFinding[] = []

  for (const message of runtime.configuration.invalid) {
    findings.push({ code: "config.invalid", message, severity: "error" })
  }

  const major = Number(process.versions.node.split(".")[0])
  if (!Number.isInteger(major) || major < 22) {
    findings.push({
      code: "runtime.node",
      message: `Node ${process.versions.node} is below the required 22`,
      severity: "error",
    })
  }

  const inside = relative(project.path, runtime.dataDirectory)
  if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) {
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

  return report(runtime, project.id, version, findings, {
    chain,
    checkpoints,
    historyEntries: entries,
    keyPermissions: permissions,
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
      invalid: runtime.configuration.invalid,
      maxRepairCycles: runtime.configuration.maxRepairCycles,
    },
    findings,
    ok: !findings.some((finding) => finding.severity === "error"),
    projectId,
    runtime: { arch: process.arch, node: process.versions.node, platform: process.platform },
    store,
    version,
  }
}
