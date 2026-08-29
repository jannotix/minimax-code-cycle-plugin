import { release } from "../admission.ts"
import { parseSnapshot } from "../evidence/accessibility.ts"
import { browserEvidence, type CapturedBy } from "../evidence/browser.ts"
import { captureCandidate } from "../evidence/candidate.ts"
import { changedFiles } from "../evidence/changes.ts"
import {
  commitMessage,
  DeliveryAborted,
  promote,
  recoverDelivery,
} from "../evidence/delivery.ts"
import { verify as verifyEvidence } from "../evidence/engine.ts"
import type { VerificationOutcome } from "../evidence/gates.ts"
import { proofEvidence, proofGateName } from "../evidence/proof-evidence.ts"
import { runProof, type ProofRequest } from "../evidence/proof.ts"
import type { Runtime } from "../runtime.ts"
import { issueCaptureCapabilities, redeemCaptureCapability } from "../store/capabilities.ts"
import { signCheckpoint } from "../store/checkpoints.ts"
import type { Database } from "../store/database.ts"
import { loadEvidence, recordEvidence } from "../store/evidence.ts"
import { appendHistory } from "../store/history.ts"
import { newId } from "../store/ids.ts"
import {
  activeWorkflowForRequest,
  candidateManifest,
  createWorkflow,
  lastRefusal,
  latestWorkflow,
  loadPlan,
  loadRequest,
  loadReviews,
  loadTasks,
  loadWorkflow,
  recordArbitration,
  recordCandidate,
  requestDigestOf,
  savePlan,
  saveWorkflow,
  setTaskState,
  submitReview,
  type StoredWorkflow,
} from "../store/workflows.ts"
import { apply, isTerminal, TransitionError, type WorkflowCommand } from "./machine.ts"
import { parsePlan } from "./plan.ts"
import { route, type Preference, type RoutingDecision } from "./routing.ts"
import { insideAny } from "./scopes.ts"
import { parseVerdict, type Verdict } from "./verdicts.ts"

export interface StartInput {
  readonly affectedPaths?: readonly string[]
  readonly preference?: Preference
  readonly projectRoot: string
  readonly request: string
}

export interface WorkflowView {
  readonly deduplicated: boolean
  readonly lastRefusal: ReturnType<typeof lastRefusal>
  readonly request: ReturnType<typeof loadRequest>
  readonly routing?: RoutingDecision
  readonly tasks: ReturnType<typeof loadTasks>
  readonly workflow: StoredWorkflow
}

export type ControlOperation = "cancel" | "pause" | "resume" | "retry"

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkflowError"
  }
}

const MAX_REQUEST_BYTES = 1024 * 1024
const MAX_AMENDMENT_BYTES = 64 * 1024
const MAX_REASON_BYTES = 4 * 1024

export function startWorkflow(
  runtime: Runtime,
  input: StartInput,
  now = Date.now(),
): WorkflowView {
  if (!input.request.trim()) throw new WorkflowError("request must not be empty")
  if (Buffer.byteLength(input.request, "utf8") > MAX_REQUEST_BYTES) {
    throw new WorkflowError(`request exceeds the ${MAX_REQUEST_BYTES}-byte limit`)
  }
  if (/^request\s*=/iu.test(input.request.trim())) {
    throw new WorkflowError("request must contain the user's text, not a serialized argument list")
  }

  const preference = input.preference ?? "auto"
  if (!(["auto", "full", "quick"] as const).includes(preference)) {
    throw new WorkflowError("preference must be auto, full, or quick")
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
    record(database, workflow, "workflow.started", { requestDigest: created.requestDigest }, now)
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
  if (workflow.projectId !== project.id) throw new WorkflowError("workflow does not belong to project_root")
  return view(database, workflow, false)
}

export function amendWorkflow(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  amendment: string,
  now = Date.now(),
): WorkflowView {
  if (!amendment.trim()) throw new WorkflowError("amendment must not be empty")
  if (Buffer.byteLength(amendment, "utf8") > MAX_AMENDMENT_BYTES) {
    throw new WorkflowError(`amendment exceeds the ${MAX_AMENDMENT_BYTES}-byte limit`)
  }
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)

  database.transaction(() => {
    const current = loadRequest(database, workflow.id)
    if (current === undefined) throw new WorkflowError("request not found")
    const amendments = [
      ...current.amendments,
      { receivedAt: now, sequence: current.amendments.length + 1, text: amendment },
    ]
    database.run(
      "update requests set amendments = ? where workflow_id = ?",
      JSON.stringify(amendments),
      workflow.id,
    )
    record(database, workflow, "request.amended", { amendment }, now, "coordinator")
  })
  return view(database, workflow, false)
}

export function submitPlan(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  raw: unknown,
  now = Date.now(),
): unknown {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "architecture") {
    throw new WorkflowError(`a plan is only accepted in architecture, not ${workflow.state}`)
  }
  const plan = parsePlan(raw)
  return database.transaction(() => {
    savePlan(database, workflow.id, plan, now)
    const next = transition(database, workflow, { type: "architecture_accepted" }, now)
    record(database, next, "architecture.accepted", {
      requirements: String(plan.requirements.length),
      tasks: String(plan.tasks.length),
    }, now, "architect")
    return {
      requirements: plan.requirements.map((entry) => entry.id),
      state: next.state,
      tasks: plan.tasks.map((task) => ({ key: task.key, writeScopes: task.writeScopes })),
    }
  })
}

export async function reportTask(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  key: string,
  status: "blocked" | "completed" | "plan_defect",
  summary: string,
  now = Date.now(),
): Promise<unknown> {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "execution" && workflow.state !== "quick_execution") {
    throw new WorkflowError(`a task is reported during execution, not ${workflow.state}`)
  }

  const tasks = loadTasks(database, workflow.id)
  const task = tasks.find((entry) => entry.key === key)
  if (tasks.length > 0 && task === undefined) throw new WorkflowError(`unknown task: ${key}`)

  const changed = await changedFiles(project.path)
  if (changed === null) {
    record(database, workflow, "execution.change_set_unreadable", { task: key }, now, "executor")
    return { reason: "the change set could not be read; task completion was not recorded", retry: true }
  }
  const changedPaths = changed.map((entry) => entry.path)

  if (status === "completed") {
    const violations = outOfScope(database, workflow.id, key, changedPaths)
    if (violations.length > 0) {
      if (task !== undefined) setTaskState(database, workflow.id, key, "blocked", now)
      record(database, workflow, "execution.scope_violation", {
        paths: violations.slice(0, 20).join(", "),
        task: key,
      }, now, "executor")
      const next = transition(
        database,
        workflow,
        { target: "execution", type: "execution_failed" },
        now,
      )
      return { outOfScope: violations, state: next.state }
    }
  }

  if (task !== undefined) setTaskState(database, workflow.id, key, status, now)
  record(database, workflow, `execution.task_${status}`, {
    summary: summary.slice(0, 2_000),
    task: key,
  }, now, "executor")

  if (status === "plan_defect") {
    const next = workflow.state === "execution"
      ? transition(database, workflow, { type: "replan" }, now)
      : transition(database, workflow, { target: "architecture", type: "execution_failed" }, now)
    return { changedPaths, state: next.state }
  }
  if (status === "blocked") {
    const next = transition(database, workflow, { target: "execution", type: "execution_failed" }, now)
    return { changedPaths, state: next.state }
  }
  return { changedPaths, state: workflow.state }
}

export async function freezeWorkflowCandidate(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  now = Date.now(),
): Promise<unknown> {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "execution" && workflow.state !== "quick_execution") {
    throw new WorkflowError(`candidate freeze is accepted during execution, not ${workflow.state}`)
  }
  const tasks = loadTasks(database, workflow.id)
  if (workflow.mode === "full" && (tasks.length === 0 || tasks.some((task) => task.state !== "completed"))) {
    throw new WorkflowError("every planned task must be completed before candidate freeze")
  }

  const captured = await captureCandidate(project.path)
  const candidateId = newId()
  return database.transaction(() => {
    const candidateDigest = recordCandidate(database, workflow.id, candidateId, captured, now)
    const next = transition(database, workflow, { candidateId, type: "candidate_ready" }, now)
    record(database, next, "candidate.frozen", {
      baseRevision: captured.manifest.baseRevision,
      candidateId,
      digest: candidateDigest,
      files: String(captured.manifest.files.length),
    }, now)
    return {
      baseRevision: captured.manifest.baseRevision,
      candidateDigest,
      candidateId,
      captureCapabilities: issueCaptureCapabilities(database, workflow.id, candidateId, now),
      files: captured.manifest.files.length,
      state: next.state,
    }
  })
}

export async function verifyWorkflowCandidate(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  now = Date.now(),
): Promise<unknown> {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "verification") {
    throw new WorkflowError(`verification is only accepted in verification, not ${workflow.state}`)
  }
  const candidateId = requireCandidate(workflow)
  const outcome = await verifyEvidence({
    candidateId,
    database,
    projectId: project.id,
    root: project.path,
    strictness: runtime.configuration.gateStrictness,
    taskCommands: loadTasks(database, workflow.id).flatMap((task) => task.verificationCommands),
  })
  record(database, workflow, "verification.completed", {
    mandatoryPassed: String(outcome.mandatoryPassed),
    reason: outcome.reason,
  }, now)
  const next = outcome.mandatoryPassed
    ? transition(database, workflow, { type: "verification_passed" }, now)
    : transition(database, workflow, { target: "execution", type: "verification_failed" }, now)
  return { ...outcome, state: next.state }
}

export function candidateEvidence(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
): unknown {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  const requirements = loadPlan(database, workflow.id)?.requirements.map((entry) => entry.id) ?? []
  if (workflow.candidateId === null) return { candidate: null, evidence: [], requirements }
  return {
    candidate: workflow.candidateId,
    evidence: loadEvidence(database, workflow.candidateId).map((item) => ({
      gate: item.gateName,
      id: item.id,
      mandatory: item.mandatory,
      reason: item.skipReason,
      status: item.status,
    })),
    requirements,
  }
}

export function submitReviewVerdict(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  role: "functional_reviewer" | "security_reviewer",
  raw: unknown,
  now = Date.now(),
): unknown {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "independent_reviews") {
    throw new WorkflowError(`a review is only accepted in independent_reviews, not ${workflow.state}`)
  }
  const candidateId = requireCandidate(workflow)
  const verdict = parseVerdict(raw, verdictContext(database, workflow, role))
  const { reviewsReady } = submitReview(database, workflow.id, candidateId, role, verdict, now)
  record(database, workflow, "review.submitted", { decision: verdict.decision, role }, now, role)
  const next = reviewsReady
    ? transition(database, workflow, { type: "reviews_ready" }, now)
    : workflow
  return { decision: verdict.decision, reviewsReady, state: next.state }
}

export function submitBrowserEvidence(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  raw: unknown,
  captureToken: string | null = null,
  now = Date.now(),
): unknown {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "verification" && workflow.state !== "independent_reviews") {
    throw new WorkflowError(`browser evidence is not accepted in ${workflow.state}`)
  }
  const candidateId = requireCandidate(workflow)
  let capturedBy: CapturedBy = "executor"
  if (captureToken !== null) {
    const redeemed = redeemCaptureCapability(database, candidateId, captureToken, now)
    if (redeemed.role === null) throw new WorkflowError(`capture capability is ${redeemed.reason}`)
    capturedBy = redeemed.role
  }
  const snapshot = parseSnapshot(raw)
  const { evidence, findings } = browserEvidence(snapshot, capturedBy, now)
  recordEvidence(database, candidateId, evidence, (item) => item.gate.mandatory)
  record(database, workflow, "browser.captured", {
    capturedBy,
    findings: String(findings.length),
    flow: snapshot.capturedFlow.slice(0, 200),
  }, now, capturedBy)
  return { accessibility: findings, capturedBy, evidenceIds: evidence.map((item) => item.id) }
}

export async function submitSecurityProof(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  request: ProofRequest & { rationale: string; vulnerabilityClass: string },
  now = Date.now(),
): Promise<unknown> {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "independent_reviews" && workflow.state !== "arbitration") {
    throw new WorkflowError(`a proof is run while the candidate is under review, not ${workflow.state}`)
  }
  if (!runtime.configuration.securityProofs) {
    throw new WorkflowError("executing security proofs is off; set CYCLE_SECURITY_PROOFS=on deliberately")
  }
  const candidateId = requireCandidate(workflow)
  const rationale = request.rationale.trim().slice(0, 2_000)
  if (!rationale) throw new WorkflowError("a proof must state its rationale")
  const result = await runProof(project.path, {
    ...(request.command === undefined ? {} : { command: request.command }),
    ...(request.interpreter === undefined ? {} : { interpreter: request.interpreter }),
    ...(request.script === undefined ? {} : { script: request.script }),
  })
  const evidence = proofEvidence(request.vulnerabilityClass, rationale, result, now)
  recordEvidence(database, candidateId, [evidence], (item) => item.gate.mandatory)
  record(database, workflow, `security.proof_${result.demonstrated ? "demonstrated" : "inconclusive"}`, {
    gate: proofGateName(request.vulnerabilityClass),
    rationale,
  }, now, "security_reviewer")
  return {
    containment: result.containment,
    demonstrated: result.demonstrated,
    evidenceId: evidence.id,
    exitCode: evidence.exitCode,
    output: evidence.output.slice(0, 8_000),
    status: evidence.status,
  }
}

export function mandatoryGatesPassed(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
): boolean {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  requireWorkflow(database, project.id, workflowId)
  const row = database.get<{ failed: number; total: number }>(
    `select count(*) as total, sum(case when e.status != 'passed' then 1 else 0 end) as failed
       from evidence e join workflows w on w.candidate_id = e.candidate_id
      where w.id = ? and e.mandatory = 1`,
    workflowId,
  )
  return (row?.total ?? 0) > 0 && (row?.failed ?? 0) === 0
}

export function arbitrateWorkflow(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  raw: unknown,
  now = Date.now(),
): unknown {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "arbitration") {
    throw new WorkflowError(`arbitration is only accepted in arbitration, not ${workflow.state}`)
  }
  const candidateId = requireCandidate(workflow)
  const verdict = parseVerdict(raw, verdictContext(database, workflow, "arbiter"))
  if (workflow.mode === "full") {
    const reviews = loadReviews(database, candidateId)
    if (reviews.length < 2) throw new WorkflowError("arbitration requires both independent reviews")
    if (verdict.decision === "approved" && reviews.some((review) => review.verdict.decision === "rejected")) {
      throw new WorkflowError("arbitration cannot approve while a reviewer rejected the candidate")
    }
  }
  const receiptDigest = recordArbitration(database, workflow.id, candidateId, verdict, now)
  let next: StoredWorkflow
  let refusal: string | null = null
  if (verdict.decision === "approved") {
    try {
      next = transition(
        database,
        workflow,
        { mandatoryGatesPassed: mandatoryGatesPassed(runtime, project.path, workflow.id), type: "approve" },
        now,
      )
    } catch (error) {
      if (!(error instanceof TransitionError) || error.code !== "gates_not_passed") throw error
      refusal = error.message
      next = transition(database, workflow, { target: "execution", type: "reject" }, now)
    }
  } else {
    next = transition(database, workflow, { target: verdict.repairTarget ?? "execution", type: "reject" }, now)
  }
  record(database, next, `arbitration.${refusal === null ? verdict.decision : "refused"}`, {
    receiptDigest,
    ...(refusal === null ? {} : { refusal }),
  }, now, "arbiter")
  return {
    decision: verdict.decision,
    receiptDigest,
    refusal,
    repair: { max: next.maxRepairCycles, used: next.repairCycles },
    state: next.state,
  }
}

export async function deliverWorkflowCandidate(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  now = Date.now(),
): Promise<unknown> {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "delivery") {
    throw new WorkflowError(`delivery is only accepted in delivery, not ${workflow.state}`)
  }
  const candidateId = requireCandidate(workflow)
  let outcome
  try {
    outcome = await promote(
      database,
      project.path,
      workflow.id,
      candidateId,
      deliveryMessage(database, workflow, candidateId),
      now,
    )
  } catch (error) {
    if (!(error instanceof DeliveryAborted)) throw error
    record(database, workflow, "delivery.aborted", { reason: error.message }, now)
    return { aborted: error.message, state: workflow.state }
  }
  const next = transition(database, workflow, { type: "deliver" }, now)
  record(database, next, "delivery.completed", {
    files: String(outcome.delivered.length),
    revision: outcome.revision,
    verifiedOnly: String(outcome.verifiedOnly.length),
  }, now)
  signCheckpoint(database, runtime.dataDirectory, now)
  return { ...outcome, state: next.state }
}

export async function reconcileWorkflow(
  runtime: Runtime,
  projectRoot: string,
  workflowId?: string,
  now = Date.now(),
): Promise<unknown> {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = workflowId === undefined
    ? latestWorkflow(database, project.id)
    : loadWorkflow(database, workflowId)
  if (workflow === undefined || workflow.projectId !== project.id) return { found: false }

  if (workflow.state === "delivery") {
    const candidateId = requireCandidate(workflow)
    const recovered = await recoverDelivery(
      database,
      project.path,
      workflow.id,
      deliveryMessage(database, workflow, candidateId),
      now,
    )
    if (recovered !== null) {
      const next = transition(database, workflow, { type: "deliver" }, now)
      record(database, next, "delivery.recovered", {
        files: String(recovered.delivered.length),
        revision: recovered.revision,
      }, now)
      signCheckpoint(database, runtime.dataDirectory, now)
      return { found: true, recovered, state: next.state }
    }
  }
  return { found: true, state: workflow.state, workflowId: workflow.id }
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
    throw new WorkflowError(`reason exceeds the ${MAX_REASON_BYTES}-byte limit`)
  }
  let command: WorkflowCommand
  switch (operation) {
    case "pause": command = { type: "pause" }; break
    case "resume": command = { type: "resume" }; break
    case "retry":
      command = workflow.state === "blocked"
        ? { additionalCycles: options.additionalCycles ?? 1, type: "resume_blocked" }
        : { type: "begin_repair" }
      break
    case "cancel":
      if (options.confirm !== true) throw new WorkflowError("cancel requires confirm: true")
      command = { type: "cancel" }
      break
  }
  workflow = database.transaction(() => {
    const moved = transition(database, workflow, command, now, { reason: options.reason ?? "" })
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

function outOfScope(
  database: Database,
  workflowId: string,
  key: string,
  changedPaths: readonly string[],
): string[] {
  const tasks = loadTasks(database, workflowId)
  if (tasks.length === 0) return []
  const authorized = tasks
    .filter((task) => task.key === key || task.state === "completed")
    .flatMap((task) => task.writeScopes)
  return changedPaths.filter((path) => !insideAny(path, authorized)).sort()
}

function verdictContext(database: Database, workflow: StoredWorkflow, role: string) {
  const plan = loadPlan(database, workflow.id)
  const evidence = database.all<{ id: string }>(
    "select e.id from evidence e join workflows w on w.candidate_id = e.candidate_id where w.id = ?",
    workflow.id,
  )
  const proofIds = loadEvidence(database, workflow.candidateId ?? "")
    .filter((item) => item.gateName.startsWith("security:proof:") && item.status === "failed")
    .map((item) => item.id)
  return {
    evidenceIds: evidence.map((row) => row.id),
    proofIds,
    requirementIds: plan?.requirements.map((entry) => entry.id) ?? [],
    requiresProof: role === "security_reviewer",
    role,
  }
}

function deliveryMessage(database: Database, workflow: StoredWorkflow, candidateId: string): string {
  const request = loadRequest(database, workflow.id)?.originalText ?? "deliver approved candidate"
  const manifest = candidateManifest(database, candidateId)
  if (manifest === undefined) throw new WorkflowError("candidate manifest not found")
  return commitMessage(request, manifest, workflow.id)
}

function transition(
  database: Database,
  workflow: StoredWorkflow,
  command: WorkflowCommand,
  now: number,
  metadata: Readonly<Record<string, string>> = {},
): StoredWorkflow {
  return database.transaction(() => {
    const before = workflow.state
    const after = apply(workflow, command)
    const moved: StoredWorkflow = { ...workflow, ...after, updatedAt: now }
    saveWorkflow(database, moved, now)
    record(database, moved, "workflow.transition", {
      command: command.type,
      from: before,
      to: moved.state,
      ...metadata,
    }, now)
    if (isTerminal(moved.state) || moved.state === "blocked" || moved.state === "paused") {
      release(database, moved.id)
    }
    return moved
  })
}

function requireWorkflow(database: Database, projectId: string, workflowId: string): StoredWorkflow {
  const workflow = loadWorkflow(database, workflowId)
  if (workflow === undefined) throw new WorkflowError("workflow not found")
  if (workflow.projectId !== projectId) throw new WorkflowError("workflow does not belong to project_root")
  return workflow
}

function requireCandidate(workflow: StoredWorkflow): string {
  if (workflow.candidateId === null) throw new WorkflowError("workflow has no candidate")
  return workflow.candidateId
}

function record(
  database: Database,
  workflow: StoredWorkflow,
  action: string,
  metadata: Readonly<Record<string, string>>,
  now: number,
  role: "arbiter" | "architect" | "coordinator" | "executor" | "functional_reviewer" | "security_reviewer" | "system" = "system",
): void {
  appendHistory(database, {
    action,
    actor: "cycle-control-plane",
    candidateId: workflow.candidateId,
    metadata,
    projectId: workflow.projectId,
    role,
    workflowId: workflow.id,
  }, now)
}

function view(database: Database, workflow: StoredWorkflow, deduplicated: boolean): WorkflowView {
  return {
    deduplicated,
    lastRefusal: lastRefusal(database, workflow.id),
    request: loadRequest(database, workflow.id),
    tasks: loadTasks(database, workflow.id),
    workflow,
  }
}

export type { Verdict, VerificationOutcome }
