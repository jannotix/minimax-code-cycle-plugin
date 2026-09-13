import type { RoleSession, WorkflowRole } from "./store/role-sessions.ts"
import type { StoredTask, StoredWorkflow } from "./store/workflows.ts"

export type BrowserCapability = "available" | "unavailable" | "unknown"
export type CoordinatorStatus = "success" | "warning" | "error"

/**
 * Whether anything actually checked that the roles are constrained.
 *
 * `verified` means a live per-role capability probe passed: a read-only role was shown to *lack*
 * `write` rather than to have declined it. `unverified-on-host` means the capability profiles are
 * installed and the control plane confirmed their bytes itself, but no probe was possible, because
 * this host exposes no record of the tools a child session actually ran with.
 *
 * Dispatch is allowed either way. It used to require `verified`, which sounded like rigour and was
 * in practice a deadlock: the proof cannot be obtained on MiniMax Desktop 3.0.68.134 at all, so
 * that rule did not raise the standard of what ran — it stopped anything from running, including
 * the ten behavioural gates that need no such proof. What it must never do is let the record go
 * quiet about it, so this value travels on every decision and downgrades every success to a
 * warning while it reads `unverified-on-host`.
 */
export type CapabilityEnforcement = "verified" | "unverified-on-host"

export interface CoordinatorInput {
  readonly browser: BrowserCapability
  readonly browserRequired: boolean
  readonly capabilityEnforcement: CapabilityEnforcement
  readonly nativeMavis: boolean
  readonly nativeTask: boolean
  readonly reviews: readonly { readonly role: string }[]
  readonly roleSessions: readonly RoleSession[]
  /** The five profiles are installed and the control plane confirmed their bytes. */
  readonly setupInstalled: boolean
  readonly tasks: readonly StoredTask[]
  readonly workflow: StoredWorkflow
}

export type CoordinatorAction =
  | { readonly kind: "dispatch_role"; readonly role: WorkflowRole; readonly taskKey: string | null }
  | { readonly kind: "resume_role"; readonly role: WorkflowRole; readonly sessionId: string; readonly taskKey: string | null }
  | { readonly blind: true; readonly kind: "dispatch_reviews"; readonly roles: readonly ("functional_reviewer" | "security_reviewer")[] }
  | { readonly kind: "control_plane"; readonly operation: "deliver" | "freeze_candidate" | "retry" | "verify" }
  | { readonly kind: "stop"; readonly reason: string }

export interface CoordinatorDecision {
  readonly action: CoordinatorAction
  /** Carried on every decision so no answer can omit it. */
  readonly capabilityEnforcement: CapabilityEnforcement
  readonly artifacts: {
    readonly mode: StoredWorkflow["mode"]
    readonly state: StoredWorkflow["state"]
    readonly workflowId: string
  }
  readonly next_actions: readonly string[]
  readonly status: CoordinatorStatus
  readonly summary: string
}

export function nextCoordinatorAction(input: CoordinatorInput): CoordinatorDecision {
  const base = {
    artifacts: {
      mode: input.workflow.mode,
      state: input.workflow.state,
      workflowId: input.workflow.id,
    },
    capabilityEnforcement: input.capabilityEnforcement,
  } as const
  if (!input.setupInstalled) {
    return stopped(base, "error", "native Cycle setup is not installed", "run setup: the five capability profiles are absent, stale, or unconfirmed")
  }
  if (!input.nativeMavis || !input.nativeTask) {
    return stopped(base, "error", "native MiniMax orchestration is unavailable", "mavis and task tools are both required")
  }
  if (input.browserRequired && input.browser !== "available") {
    return stopped(base, "error", "browser capability is required but unavailable", `browser capability is ${input.browser}`)
  }

  switch (input.workflow.state) {
    case "architecture":
      return role(base, input, "architect", null, "the architect must produce the validated plan")
    case "execution":
      return execution(base, input)
    case "quick_execution": {
      const executor = latestSession(input, "executor")
      return executor === null
        ? role(base, input, "executor", null, "the quick route needs one bounded implementation session")
        : control(base, "freeze_candidate", "the quick executor reported; freeze the exact candidate")
    }
    case "verification":
      return control(base, "verify", "run deterministic gates against the frozen candidate")
    case "independent_reviews":
      return reviews(base, input)
    case "arbitration":
      return role(base, input, "arbiter", null, "the arbiter must decide against the immutable request")
    case "delivery":
      return control(base, "deliver", "promote only the approved candidate bytes")
    case "repair":
      return control(base, "retry", "start the recorded repair target within the remaining budget")
    case "paused":
      return stopped(base, "warning", "workflow is paused", "wait for an explicit user resume")
    case "blocked":
      return stopped(base, "warning", "workflow is blocked", "the user must extend the repair budget, amend, or cancel")
    case "completed":
      return stopped(base, "success", "workflow is completed", "report the exact returned state and revision")
    case "cancelled":
      return stopped(base, "warning", "workflow is cancelled", "report cancellation without resuming work")
    case "intake":
    case "routing":
      return stopped(base, "error", "workflow stopped in an internal transition state", "call reconcile and do not invent the next state")
    default:
      return stopped(base, "error", "workflow state is unsupported", "stop and inspect the control-plane version")
  }
}

function execution(
  base: CoordinatorDecisionBase,
  input: CoordinatorInput,
): CoordinatorDecision {
  if (input.tasks.length === 0) {
    return stopped(base, "error", "full execution has no planned tasks", "return to architecture")
  }
  if (input.tasks.every((task) => task.state === "completed")) {
    return control(base, "freeze_candidate", "all planned tasks are complete; freeze the exact candidate")
  }
  const completed = new Set(
    input.tasks.filter((task) => task.state === "completed").map((task) => task.key),
  )
  const next = input.tasks.find(
    (task) => task.state !== "completed" && task.dependencies.every((key) => completed.has(key)),
  )
  if (next === undefined) {
    return stopped(base, "error", "no executable task remains", "the task graph or reported task states are inconsistent")
  }
  return role(base, input, "executor", next.key, `execute only ${next.key} inside its write scopes`)
}

function reviews(base: CoordinatorDecisionBase, input: CoordinatorInput): CoordinatorDecision {
  const submitted = new Set(input.reviews.map((review) => review.role))
  const missing = (["functional_reviewer", "security_reviewer"] as const).filter(
    (roleName) => !submitted.has(roleName),
  )
  if (missing.length === 0) {
    return stopped(base, "error", "reviews exist but arbitration did not open", "reconcile the durable workflow state")
  }
  if (missing.length === 2 && missing.every((roleName) => latestSession(input, roleName) === null)) {
    return {
      ...base,
      action: { blind: true, kind: "dispatch_reviews", roles: missing },
      next_actions: ["dispatch both reviewers in separate background sessions", "withhold each verdict from the other"],
      status: reported(base, "success"),
      summary: "dispatch both independent reviewers blind to one another",
    }
  }
  const next = missing[0]!
  return role(base, input, next, null, `complete the missing ${next} review without exposing the other verdict`)
}

function role(
  base: CoordinatorDecisionBase,
  input: CoordinatorInput,
  roleName: WorkflowRole,
  taskKey: string | null,
  summary: string,
): CoordinatorDecision {
  const existing = latestSession(input, roleName)
  return {
    ...base,
    action: existing === null
      ? { kind: "dispatch_role", role: roleName, taskKey }
      : { kind: "resume_role", role: roleName, sessionId: existing, taskKey },
    next_actions: [
      existing === null ? `create a separate ${roleName} task session` : `resume ${existing}`,
      "submit only schema-valid output to the control plane",
    ],
    status: reported(base, "success"),
    summary,
  }
}

function latestSession(input: CoordinatorInput, roleName: WorkflowRole): string | null {
  const candidateBound = roleName === "functional_reviewer" || roleName === "security_reviewer" || roleName === "arbiter"
  const matching = input.roleSessions.filter(
    (entry) =>
      entry.role === roleName &&
      (!candidateBound || entry.candidateId === input.workflow.candidateId),
  )
  return matching.at(-1)?.sessionId ?? null
}

function control(
  base: CoordinatorDecisionBase,
  operation: Extract<CoordinatorAction, { kind: "control_plane" }>["operation"],
  summary: string,
): CoordinatorDecision {
  return {
    ...base,
    action: { kind: "control_plane", operation },
    next_actions: [`call cycle_workflow ${operation}`, "read the returned state before continuing"],
    status: reported(base, "success"),
    summary,
  }
}

/**
 * The status an answer is allowed to carry.
 *
 * While the capability enforcement is unproven, nothing reports plain success: the run may proceed,
 * and the answer says out loud that no one checked the roles are constrained. A caller that ignores
 * a warning is making its own choice; a caller that never sees one was misled.
 */
function reported(base: CoordinatorDecisionBase, status: CoordinatorStatus): CoordinatorStatus {
  if (status !== "success") return status
  return base.capabilityEnforcement === "verified" ? "success" : "warning"
}

function stopped(
  base: CoordinatorDecisionBase,
  status: CoordinatorStatus,
  summary: string,
  reason: string,
): CoordinatorDecision {
  return {
    ...base,
    action: { kind: "stop", reason },
    next_actions: [reason],
    status: reported(base, status),
    summary,
  }
}

type CoordinatorDecisionBase = Pick<CoordinatorDecision, "artifacts" | "capabilityEnforcement">
