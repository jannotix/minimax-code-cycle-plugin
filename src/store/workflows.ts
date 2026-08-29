import { DIGEST_DOMAIN, digest, newId } from "./ids.ts"
import type { Database, Row } from "./database.ts"
import type {
  Workflow,
  WorkflowMode,
  WorkflowState,
} from "../workflow/machine.ts"

export interface StoredRequest {
  readonly amendments: readonly { receivedAt: number; sequence: number; text: string }[]
  readonly digest: string
  readonly originalText: string
}

export interface StoredWorkflow extends Workflow {
  readonly createdAt: number
  readonly id: string
  readonly projectId: string
  readonly updatedAt: number
}

export function createWorkflow(
  database: Database,
  projectId: string,
  originalText: string,
  maxRepairCycles: number,
  now: number,
): { id: string; requestDigest: string } {
  const id = newId()
  const requestDigest = requestDigestOf(originalText)

  database.transaction(() => {
    database.run(
      `insert into workflows (id, project_id, state, max_repair_cycles, created_at, updated_at)
       values (?, ?, 'intake', ?, ?, ?)`,
      id,
      projectId,
      maxRepairCycles,
      now,
      now,
    )
    database.run(
      "insert into requests (workflow_id, original_text, digest, created_at) values (?, ?, ?, ?)",
      id,
      originalText,
      requestDigest,
      now,
    )
  })

  return { id, requestDigest }
}

export function requestDigestOf(originalText: string): string {
  return digest(DIGEST_DOMAIN.request, { attachments: [], text: originalText })
}

export function activeWorkflowForRequest(
  database: Database,
  projectId: string,
  requestDigest: string,
): StoredWorkflow | undefined {
  const row = database.get<Row>(
    `select workflows.* from workflows
       join requests on requests.workflow_id = workflows.id
      where workflows.project_id = ? and requests.digest = ?
        and workflows.state not in ('cancelled', 'completed')
      order by workflows.created_at desc limit 1`,
    projectId,
    requestDigest,
  )
  return row === undefined ? undefined : toWorkflow(row)
}

export function loadWorkflow(database: Database, id: string): StoredWorkflow | undefined {
  const row = database.get<Row>("select * from workflows where id = ?", id)
  return row === undefined ? undefined : toWorkflow(row)
}

export function latestWorkflow(database: Database, projectId: string): StoredWorkflow | undefined {
  const row = database.get<Row>(
    "select * from workflows where project_id = ? order by updated_at desc limit 1",
    projectId,
  )
  return row === undefined ? undefined : toWorkflow(row)
}

export function saveWorkflow(database: Database, workflow: StoredWorkflow, now: number): void {
  database.run(
    `update workflows set state = ?, mode = ?, candidate_id = ?, repair_target = ?,
       repair_cycles = ?, max_repair_cycles = ?, paused_from = ?, blocked_from = ?, updated_at = ?
     where id = ?`,
    workflow.state,
    workflow.mode,
    workflow.candidateId,
    workflow.repairTarget,
    workflow.repairCycles,
    workflow.maxRepairCycles,
    workflow.pausedFrom,
    workflow.blockedFrom,
    now,
    workflow.id,
  )
}

export function loadRequest(database: Database, workflowId: string): StoredRequest | undefined {
  const row = database.get<Row>("select * from requests where workflow_id = ?", workflowId)
  if (row === undefined) return undefined
  return {
    amendments: JSON.parse(String(row["amendments"])) as StoredRequest["amendments"],
    digest: String(row["digest"]),
    originalText: String(row["original_text"]),
  }
}

export function amendRequest(
  database: Database,
  workflowId: string,
  text: string,
  now: number,
): void {
  const current = loadRequest(database, workflowId)
  if (current === undefined) throw new Error("no request for this workflow")
  const amendments = [
    ...current.amendments,
    { receivedAt: now, sequence: current.amendments.length + 1, text },
  ]
  database.run(
    "update requests set amendments = ? where workflow_id = ?",
    JSON.stringify(amendments),
    workflowId,
  )
}

function toWorkflow(row: Row): StoredWorkflow {
  return {
    blockedFrom: (row["blocked_from"] as WorkflowState | null) ?? null,
    candidateId: (row["candidate_id"] as string | null) ?? null,
    createdAt: Number(row["created_at"]),
    id: String(row["id"]),
    maxRepairCycles: Number(row["max_repair_cycles"]),
    mode: (row["mode"] as WorkflowMode | null) ?? null,
    pausedFrom: (row["paused_from"] as WorkflowState | null) ?? null,
    projectId: String(row["project_id"]),
    repairCycles: Number(row["repair_cycles"]),
    repairTarget: (row["repair_target"] as StoredWorkflow["repairTarget"]) ?? null,
    state: String(row["state"]) as WorkflowState,
    updatedAt: Number(row["updated_at"]),
  }
}
