import { release } from "../admission.ts"
import { parseSnapshot } from "../evidence/accessibility.ts"
import { browserEvidence, type CapturedBy } from "../evidence/browser.ts"
import { captureCandidate } from "../evidence/candidate.ts"
import { changedFiles } from "../evidence/changes.ts"
import {
  commitMessage,
  DeliveryAborted,
  deliveryOf,
  manifestWithEvidence,
  promote,
  recoverDelivery,
} from "../evidence/delivery.ts"
import { verify as verifyEvidence } from "../evidence/engine.ts"
import type { VerificationOutcome } from "../evidence/gates.ts"
import { proofEvidence, proofGateName } from "../evidence/proof-evidence.ts"
import { runProof, type ProofRequest } from "../evidence/proof.ts"
import { advanceGoalOfWorkflow, linkStartedWorkflow } from "../goals.ts"
import { captureBlocked, captureDelivery } from "../memory.ts"
import type { Runtime } from "../runtime.ts"
import { issueCaptureCapabilities, redeemCaptureCapability } from "../store/capabilities.ts"
import { signCheckpoint } from "../store/checkpoints.ts"
import type { Database } from "../store/database.ts"
import { loadEvidence, recordEvidence } from "../store/evidence.ts"
import { goalOfWorkflow } from "../store/goals.ts"
import { appendHistory, lastEvent } from "../store/history.ts"
import { newId } from "../store/ids.ts"
import {
  bindRoleSession,
  candidateReviewerSessions,
  roleSessions,
  type WorkflowRole,
} from "../store/role-sessions.ts"
import {
  activeWorkflowForRequest,
  createWorkflow,
  frozenFiles,
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
  readonly goalId: string | null
  readonly lastRefusal: ReturnType<typeof lastRefusal>
  readonly request: ReturnType<typeof loadRequest>
  readonly reviews: ReturnType<typeof loadReviews>
  readonly roleSessions: ReturnType<typeof roleSessions>
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

export function bindWorkflowRoleSession(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  role: WorkflowRole,
  roleSessionId: string,
  now = Date.now(),
): unknown {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  const allowed: Readonly<Record<WorkflowRole, readonly StoredWorkflow["state"][]>> = {
    architect: ["architecture"],
    executor: ["execution", "quick_execution"],
    functional_reviewer: ["independent_reviews"],
    security_reviewer: ["independent_reviews", "arbitration"],
    arbiter: ["arbitration"],
  }
  if (!allowed[role].includes(workflow.state)) {
    throw new WorkflowError(`${role} session cannot bind while workflow is ${workflow.state}`)
  }
  const candidateId = role === "functional_reviewer" || role === "security_reviewer" || role === "arbiter"
    ? requireCandidate(workflow)
    : null
  const existing = roleSessions(database, workflow.id).some(
    (entry) => entry.role === role && entry.sessionId === roleSessionId,
  )
  const binding = bindRoleSession(database, workflow.id, candidateId, role, roleSessionId, now)
  if (!existing) {
    record(database, workflow, "role.session_bound", { role }, now, role, roleSessionId)
  }
  return { binding, state: workflow.state }
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
    const goalId = linkStartedWorkflow(
      { database, projectId: project.id },
      workflow.id,
      input.request,
      now,
    )
    record(database, workflow, "workflow.started", {
      ...(goalId === null ? {} : { goalId }),
      requestDigest: created.requestDigest,
    }, now)
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
  roleSessionId: string,
  now = Date.now(),
): unknown {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "architecture") {
    throw new WorkflowError(`a plan is only accepted in architecture, not ${workflow.state}`)
  }
  bindRoleSession(database, workflow.id, null, "architect", roleSessionId, now)
  const plan = parsePlan(raw)
  return database.transaction(() => {
    savePlan(database, workflow.id, plan, now)
    const next = transition(database, workflow, { type: "architecture_accepted" }, now)
    record(database, next, "architecture.accepted", {
      requirements: String(plan.requirements.length),
      tasks: String(plan.tasks.length),
    }, now, "architect", roleSessionId)
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
  roleSessionId: string,
  now = Date.now(),
): Promise<unknown> {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "execution" && workflow.state !== "quick_execution") {
    throw new WorkflowError(`a task is reported during execution, not ${workflow.state}`)
  }
  bindRoleSession(database, workflow.id, null, "executor", roleSessionId, now)

  const tasks = loadTasks(database, workflow.id)
  const task = tasks.find((entry) => entry.key === key)
  if (tasks.length > 0 && task === undefined) throw new WorkflowError(`unknown task: ${key}`)

  const changed = await changedFiles(project.path)
  if (changed === null) {
    record(database, workflow, "execution.change_set_unreadable", { task: key }, now, "executor", roleSessionId)
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
      }, now, "executor", roleSessionId)
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
  }, now, "executor", roleSessionId)

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
  return database.transaction(() => {
    record(database, workflow, "verification.completed", {
      mandatoryPassed: String(outcome.mandatoryPassed),
      reason: outcome.reason,
    }, now)
    const next = outcome.mandatoryPassed
      ? transition(database, workflow, { type: "verification_passed" }, now)
      : transition(database, workflow, { target: "execution", type: "verification_failed" }, now)
    const memoryId = rememberIfBlocked(database, next, workflow.candidateId, now)
    return { ...outcome, memoryId, state: next.state }
  })
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
  if (workflow.candidateId === null) return { candidate: null, evidence: [], requirements, reviews: [] }
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
    // The reviews recorded against this candidate, so an arbiter can be handed what the reviewers
    // concluded. A run resumed at arbitration reads them from here exactly as a fresh run does;
    // without that, the arbiter judges the candidate without knowing it was already rejected.
    reviews: loadReviews(database, workflow.candidateId).map((review) => ({
      decision: review.verdict.decision,
      findings: review.verdict.findings ?? [],
      repairTarget: review.verdict.repairTarget ?? null,
      role: review.role,
    })),
  }
}

export function submitReviewVerdict(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  role: "functional_reviewer" | "security_reviewer",
  raw: unknown,
  roleSessionId: string,
  now = Date.now(),
): unknown {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "independent_reviews") {
    throw new WorkflowError(`a review is only accepted in independent_reviews, not ${workflow.state}`)
  }
  const candidateId = requireCandidate(workflow)
  bindRoleSession(database, workflow.id, candidateId, role, roleSessionId, now)
  const verdict = parseVerdict(raw, verdictContext(database, workflow, role))
  const { reviewsReady } = submitReview(database, workflow.id, candidateId, role, verdict, now)
  record(database, workflow, "review.submitted", { decision: verdict.decision, role }, now, role, roleSessionId)
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
  roleSessionId: string,
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
  bindRoleSession(
    database,
    workflow.id,
    capturedBy === "executor" ? null : candidateId,
    capturedBy,
    roleSessionId,
    now,
  )
  const snapshot = parseSnapshot(raw)
  const { evidence, findings } = browserEvidence(snapshot, capturedBy, now)
  recordEvidence(database, candidateId, evidence, (item) => item.gate.mandatory)
  record(database, workflow, "browser.captured", {
    capturedBy,
    findings: String(findings.length),
    flow: snapshot.capturedFlow.slice(0, 200),
  }, now, capturedBy, roleSessionId)
  return { accessibility: findings, capturedBy, evidenceIds: evidence.map((item) => item.id) }
}

export async function submitSecurityProof(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  request: ProofRequest & { rationale: string; vulnerabilityClass: string },
  roleSessionId: string,
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
  bindRoleSession(database, workflow.id, candidateId, "security_reviewer", roleSessionId, now)
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
  }, now, "security_reviewer", roleSessionId)
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
  roleSessionId: string,
  now = Date.now(),
): unknown {
  const project = runtime.project(projectRoot)
  const database = runtime.requireStore()
  const workflow = requireWorkflow(database, project.id, workflowId)
  if (workflow.state !== "arbitration") {
    throw new WorkflowError(`arbitration is only accepted in arbitration, not ${workflow.state}`)
  }
  const candidateId = requireCandidate(workflow)
  bindRoleSession(database, workflow.id, candidateId, "arbiter", roleSessionId, now)
  const verdict = parseVerdict(raw, verdictContext(database, workflow, "arbiter"))
  // A rejection by either independent reviewer binds: the arbiter judges against the original
  // request, not over the reviewers, so an approval that contradicts a live rejection cannot become
  // a delivery. It used to be refused with a throw, before anything was recorded — no arbitration
  // row, no history event, an empty lastRefusal — and the coordinator then re-dispatched the arbiter
  // with the same prompt, which produced the same verdict. The run could not converge and left no
  // trace of why. It is handled now the way an approval over failing gates already is: recorded
  // verbatim, refused by name in the chain, and routed to repair toward the target the rejecting
  // reviewer asked for, so one dispatch converges even when the arbiter is wrong.
  let boundBy: { readonly target: "architecture" | "execution"; readonly who: string } | null = null
  if (workflow.mode === "full") {
    const reviews = loadReviews(database, candidateId)
    if (reviews.length < 2) throw new WorkflowError("arbitration requires both independent reviews")
    if (candidateReviewerSessions(database, workflow.id, candidateId) === null) {
      throw new WorkflowError("arbitration requires two distinct native reviewer sessions")
    }
    const rejecting = reviews.filter((review) => review.verdict.decision === "rejected")
    if (verdict.decision === "approved" && rejecting.length > 0) {
      boundBy = {
        target: rejecting.some((review) => review.verdict.repairTarget === "architecture")
          ? "architecture"
          : "execution",
        who: rejecting.map((review) => review.role).join(" and "),
      }
    }
  }
  return database.transaction(() => {
    const receiptDigest = recordArbitration(database, workflow.id, candidateId, verdict, now)
    let next: StoredWorkflow
    let refusal: string | null = null
    if (boundBy !== null) {
      refusal =
        "arbitration cannot approve while a reviewer rejected the candidate: " +
        `${boundBy.who} rejected it, and that rejection stands until a repair answers it`
      next = transition(database, workflow, { target: boundBy.target, type: "reject" }, now)
    } else if (verdict.decision === "approved") {
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
    const memoryId = rememberIfBlocked(database, next, candidateId, now)
    record(database, next, `arbitration.${refusal === null ? verdict.decision : "refused"}`, {
      receiptDigest,
      ...(memoryId === null ? {} : { memoryId }),
      ...(refusal === null ? {} : { refusal }),
    }, now, "arbiter", roleSessionId)
    return {
      decision: verdict.decision,
      memoryId,
      receiptDigest,
      refusal,
      repair: { max: next.maxRepairCycles, used: next.repairCycles },
      state: next.state,
    }
  })
}

export async function deliverWorkflowCandidate(
  runtime: Runtime,
  projectRoot: string,
  workflowId: string,
  capabilityEnforcement?: "verified" | "unverified-on-host",
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
      deliveryMessage(database, workflow, candidateId, capabilityEnforcement),
      now,
    )
  } catch (error) {
    if (!(error instanceof DeliveryAborted)) throw error
    record(database, workflow, "delivery.aborted", { reason: error.message }, now)
    return { aborted: error.message, state: workflow.state }
  }
  const { goal, learned, next } = database.transaction(() => {
    const next = transition(database, workflow, { type: "deliver" }, now)
    const learned = captureDelivery(
      { database, projectId: project.id },
      {
        candidateId,
        files: outcome.delivered,
        request: loadRequest(database, workflow.id)?.originalText ?? "",
        revision: outcome.revision,
        workflowId: workflow.id,
      },
      now,
    )
    const goal = advanceGoalOfWorkflow({ database, projectId: project.id }, workflow.id, now)
    record(database, next, "delivery.completed", {
      files: String(outcome.delivered.length),
      ...(goal === null ? {} : { goalId: goal.goalId, goalBlocked: String(goal.blocked) }),
      memories: String(learned.length),
      revision: outcome.revision,
      verifiedOnly: String(outcome.verifiedOnly.length),
    }, now)
    return { goal, learned, next }
  })
  signCheckpoint(database, runtime.dataDirectory, now)
  return { ...outcome, goal, memories: learned, state: next.state }
}

export async function reconcileWorkflow(
  runtime: Runtime,
  projectRoot: string,
  workflowId?: string,
  capabilityEnforcement?: "verified" | "unverified-on-host",
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
      deliveryMessage(database, workflow, candidateId, capabilityEnforcement),
      now,
    )
    if (recovered !== null) {
      const { goal, learned, next } = database.transaction(() => {
        const next = transition(database, workflow, { type: "deliver" }, now)
        const learned = captureDelivery(
          { database, projectId: project.id },
          {
            candidateId,
            files: recovered.delivered,
            request: loadRequest(database, workflow.id)?.originalText ?? "",
            revision: recovered.revision,
            workflowId: workflow.id,
          },
          now,
        )
        const goal = advanceGoalOfWorkflow({ database, projectId: project.id }, workflow.id, now)
        record(database, next, "delivery.recovered", {
          files: String(recovered.delivered.length),
          ...(goal === null ? {} : { goalId: goal.goalId, goalBlocked: String(goal.blocked) }),
          memories: String(learned.length),
          revision: recovered.revision,
        }, now)
        return { goal, learned, next }
      })
      signCheckpoint(database, runtime.dataDirectory, now)
      return { found: true, goal, memories: learned, recovered, state: next.state }
    }

    // No journal row, and no abort in the history: the approval was recorded and a promotion never
    // began. A crash mid-write and a call that never arrived leave the same journal — none, or one
    // half-written — but they are opposites to act on. The first must not be retried. The second is
    // safe, and `promote` re-verifies every approved byte before it commits, so the plane refuses
    // this itself if the tree has moved since.
    //
    // The journal alone cannot tell them apart, and neither can it separate either from a delivery
    // that ran and aborted: `promote` checks the bytes before it journals, so an abort leaves no
    // row. The history can, because the plane records `delivery.aborted` by name, and an aborted
    // attempt is the one case a person has to look at first.
    //
    // Reading only the journal, reconcile called every one of these interrupted and refused to
    // finish work that was safe to finish. In a session that ends before delivery the workflow dies
    // with the session, so this was the ordinary way a cycle ended, not the edge.
    if (
      deliveryOf(database, workflow.id) === undefined &&
      lastEvent(database, workflow.id, "delivery.aborted") === undefined
    ) {
      const delivered = await deliverWorkflowCandidate(
        runtime,
        projectRoot,
        workflow.id,
        capabilityEnforcement,
        now,
      )
      const current = loadWorkflow(database, workflow.id)
      return { delivered, found: true, state: current?.state ?? workflow.state, workflowId: workflow.id }
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

function deliveryMessage(
  database: Database,
  workflow: StoredWorkflow,
  candidateId: string,
  capabilityEnforcement?: "verified" | "unverified-on-host",
): string {
  const request = loadRequest(database, workflow.id)?.originalText ?? "deliver approved candidate"
  // The same manifest promotion journals, not the stored row: the row is frozen before verification
  // and names no evidence, so reading it here made every commit claim zero gates.
  const manifest = manifestWithEvidence(database, candidateId)
  if (manifest === null) throw new WorkflowError("candidate manifest not found")
  return commitMessage(request, manifest, workflow.id, capabilityEnforcement)
}

function rememberIfBlocked(
  database: Database,
  workflow: StoredWorkflow,
  candidateId: string | null,
  now: number,
): string | null {
  if (workflow.state !== "blocked" || candidateId === null) return null
  return captureBlocked(
    { database, projectId: workflow.projectId },
    {
      candidateId,
      cycles: workflow.repairCycles,
      files: frozenFiles(database, candidateId).map((file) => file.path),
      request: loadRequest(database, workflow.id)?.originalText ?? "",
      workflowId: workflow.id,
    },
    now,
  )
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
  sessionId: string | null = null,
): void {
  appendHistory(database, {
    action,
    actor: "cycle-control-plane",
    candidateId: workflow.candidateId,
    metadata,
    projectId: workflow.projectId,
    role,
    sessionId,
    workflowId: workflow.id,
  }, now)
}

function view(database: Database, workflow: StoredWorkflow, deduplicated: boolean): WorkflowView {
  return {
    deduplicated,
    goalId: goalOfWorkflow(database, workflow.id) ?? null,
    lastRefusal: lastRefusal(database, workflow.id),
    request: loadRequest(database, workflow.id),
    reviews: workflow.candidateId === null ? [] : loadReviews(database, workflow.candidateId),
    roleSessions: roleSessions(database, workflow.id),
    tasks: loadTasks(database, workflow.id),
    workflow,
  }
}

export type { Verdict, VerificationOutcome }
