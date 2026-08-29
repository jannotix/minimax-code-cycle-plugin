import { release } from "../admission.ts"
import type { Runtime } from "../runtime.ts"
import { signCheckpoint } from "../store/checkpoints.ts"
import { appendHistory } from "../store/history.ts"
import type { Database } from "../store/database.ts"
import {
  activeWorkflowForRequest,
  amendRequest,
  createWorkflow,
  latestWorkflow,
  loadRequest,
  loadWorkflow,
  requestDigestOf,
  saveWorkflow,
  type StoredWorkflow,
} from "../store/workflows.ts"
import { apply, type WorkflowCommand } from "./machine.ts"
import { route, type Preference, type RoutingDecision } from "./routing.ts"

export interface StartInput {
  readonly affectedPaths?: readonly string[]
  readonly preference?: Preference
  readonly projectRoot: string
  readonly request: string
}

export interface WorkflowView {
  readonly deduplicated: boolean
  readonly request: ReturnType<typeof loadRequest>
  readonly routing?: RoutingDecision
  readonly workflow: StoredWorkflow
}

export type ControlOperation = "cancel" | "pause" | "resume" | "retry"

const MAX_REQUEST_BYTES = 1024 * 1024
const MAX_AMENDMENT_BYTES = 64 * 1024
const MAX_REASON_BYTES = 4 * 1024

export function startWorkflow(
  runtime: Runtime,
  input: StartInput,
  now = Date.now(),
): WorkflowView {
  if (!input.request.trim()) throw new Error("request must not be empty")
  if (Buffer.byteLength(input.request, "utf8") > MAX_REQUEST_BYTES) {
    throw new Error(`request exceeds the ${MAX_REQUEST_BYTES}-byte limit`)
  }
  const preference = input.preference ?? "auto"
  if (!(["auto", "full", "quick"] as const).includes(preference)) {
    throw new Error("preference must be auto, full, or quick")
  }

  const project = runtime.project(input.projectRoot)
  const database = runtime.requireStore()
  const requestDigest = requestDigestOf(input.request)
  const existing = activeWorkflowForRequest(database, project.id, requestDigest)
  if (existing !== undefined) return view(database, existing, true)

  return database.transaction(() => {
    const created = createWorkflow(
      database,
      project.id,
      input.request,
      runtime.configuration.maxRepairCycles,
      now,
    )
    let workflow = requireWorkflow(database, project.id, created.id)
    appendHistory(
      database,
      {
        action: "workflow.started",
        actor: "cycle-control-plane",
        metadata: { requestDigest: created.requestDigest },
        projectId: project.id,
        role: "system",
        workflowId: workflow.id,
      },
      now,
    )

    workflow = transition(database, workflow, { type: "complete_intake" }, now)
    const decision = route(input.request, input.affectedPaths ?? [], preference)
    workflow = transition(database, workflow, { mode: decision.mode, type: "route" }, now, {
      critical: decision.critical.join(","),
      rationale: decision.rationale,
      userPromoted: String(decision.userPromoted),
    })
    return { ...view(database, workflow, false), routing: decision }
  })
}

export function workflowStatus(
  runtime: Runtime,
  projectRoot: string,
  workflowId?: string,
): WorkflowView | null {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = workflowId
    ? loadWorkflow(database, workflowId)
    : latestWorkflow(database, project.id)
  if (workflow === undefined) return null
  if (workflow.projectId !== project.id) throw new Error("workflow does not belong to project_root")
  return view(database, workflow, false)
}

export function amendWorkflow(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  amendment: string,
  now = Date.now(),
): WorkflowView {
  if (!amendment.trim()) throw new Error("amendment must not be empty")
  if (Buffer.byteLength(amendment, "utf8") > MAX_AMENDMENT_BYTES) {
    throw new Error(`amendment exceeds the ${MAX_AMENDMENT_BYTES}-byte limit`)
  }
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)

  database.transaction(() => {
    amendRequest(database, workflow.id, amendment, now)
    appendHistory(
      database,
      {
        action: "request.amended",
        actor: "cycle-coordinator",
        metadata: { amendment },
        projectId: project.id,
        role: "coordinator",
        workflowId: workflow.id,
      },
      now,
    )
  })
  return view(database, workflow, false)
}

export function controlWorkflow(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  operation: ControlOperation,
  options: { readonly additionalCycles?: number; readonly confirm?: boolean; readonly reason?: string } = {},
  now = Date.now(),
): WorkflowView {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  let workflow = requireWorkflow(database, project.id, workflowId)
  if (Buffer.byteLength(options.reason ?? "", "utf8") > MAX_REASON_BYTES) {
    throw new Error(`reason exceeds the ${MAX_REASON_BYTES}-byte limit`)
  }

  let command: WorkflowCommand
  switch (operation) {
    case "pause":
      command = { type: "pause" }
      break
    case "resume":
      command = { type: "resume" }
      break
    case "retry":
      command = workflow.state === "blocked"
        ? { additionalCycles: options.additionalCycles ?? 1, type: "resume_blocked" }
        : { type: "begin_repair" }
      break
    case "cancel":
      if (options.confirm !== true) throw new Error("cancel requires confirm: true")
      command = { type: "cancel" }
      break
  }

  workflow = database.transaction(() => {
    const moved = transition(database, workflow, command, now, {
      reason: options.reason ?? "",
    })
    if (operation === "pause" || operation === "cancel") release(database, workflow.id)
    if (operation === "cancel") signCheckpoint(database, runtime.dataDirectory, now)
    return moved
  })
  return view(database, workflow, false)
}

export function requireProjectWorkflow(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
): StoredWorkflow {
  const project = runtime.project(projectRoot)
  return requireWorkflow(runtime.requireStore(), project.id, workflowId)
}

function transition(
  database: Database,
  workflow: StoredWorkflow,
  command: WorkflowCommand,
  now: number,
  metadata: Readonly<Record<string, string>> = {},
): StoredWorkflow {
  const before = workflow.state
  const after = apply(workflow, command)
  const moved: StoredWorkflow = { ...workflow, ...after, updatedAt: now }
  saveWorkflow(database, moved, now)
  appendHistory(
    database,
    {
      action: "workflow.transition",
      actor: "cycle-control-plane",
      metadata: { command: command.type, from: before, to: moved.state, ...metadata },
      projectId: workflow.projectId,
      role: "system",
      workflowId: workflow.id,
    },
    now,
  )
  return moved
}

function requireWorkflow(database: Database, projectId: string, workflowId: string): StoredWorkflow {
  const workflow = loadWorkflow(database, workflowId)
  if (workflow === undefined) throw new Error("workflow not found")
  if (workflow.projectId !== projectId) throw new Error("workflow does not belong to project_root")
  return workflow
}

function view(database: Database, workflow: StoredWorkflow, deduplicated: boolean): WorkflowView {
  return {
    deduplicated,
    request: loadRequest(database, workflow.id),
    workflow,
  }
}
