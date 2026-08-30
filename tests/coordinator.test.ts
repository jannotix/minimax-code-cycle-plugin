import assert from "node:assert/strict"
import { test } from "node:test"

import { nextCoordinatorAction, type CoordinatorInput } from "../src/coordinator.ts"
import type { RoleSession } from "../src/store/role-sessions.ts"
import type { StoredTask, StoredWorkflow } from "../src/store/workflows.ts"
import type { WorkflowState } from "../src/workflow/machine.ts"

const workflow = (state: WorkflowState, overrides: Partial<StoredWorkflow> = {}): StoredWorkflow => ({
  blockedFrom: null,
  candidateId: state === "independent_reviews" || state === "arbitration" || state === "delivery" ? "c1" : null,
  createdAt: 1,
  id: "w1",
  maxRepairCycles: 5,
  mode: state === "quick_execution" ? "quick" : "full",
  pausedFrom: null,
  projectId: "p1",
  repairCycles: 0,
  repairTarget: null,
  state,
  updatedAt: 1,
  ...overrides,
})

const task = (key: string, state = "pending", dependencies: readonly string[] = []): StoredTask => ({
  dependencies,
  id: `id-${key}`,
  key,
  objective: key,
  position: Number(key.replace(/\D/gu, "")) || 0,
  state,
  title: key,
  verificationCommands: ["node --version"],
  writeScopes: ["src"],
})

const session = (
  role: RoleSession["role"],
  sessionId: string,
  candidateId: string | null = null,
): RoleSession => ({ boundAt: 1, candidateId, role, sessionId, workflowId: "w1" })

const input = (state: WorkflowState, overrides: Partial<CoordinatorInput> = {}): CoordinatorInput => ({
  browser: "available",
  browserRequired: false,
  nativeMavis: true,
  nativeTask: true,
  reviews: [],
  roleSessions: [],
  setupReady: true,
  tasks: [],
  workflow: workflow(state),
  ...overrides,
})

test("coordinator preflight fails closed on setup, native tools, and required browser", () => {
  assert.equal(nextCoordinatorAction(input("architecture", { setupReady: false })).action.kind, "stop")
  assert.equal(nextCoordinatorAction(input("architecture", { nativeTask: false })).status, "error")
  assert.match(
    nextCoordinatorAction(input("execution", { browser: "unknown", browserRequired: true })).summary,
    /browser capability is required/u,
  )
})

test("architecture dispatches once and malformed output resumes the same native session", () => {
  const first = nextCoordinatorAction(input("architecture"))
  assert.deepEqual(first.action, { kind: "dispatch_role", role: "architect", taskKey: null })
  const resumed = nextCoordinatorAction(input("architecture", {
    roleSessions: [session("architect", "mvs-architect")],
  }))
  assert.deepEqual(resumed.action, {
    kind: "resume_role",
    role: "architect",
    sessionId: "mvs-architect",
    taskKey: null,
  })
})

test("full execution follows dependencies and freezes only after every task completes", () => {
  const waiting = nextCoordinatorAction(input("execution", {
    tasks: [task("task-1", "completed"), task("task-2", "pending", ["task-1"])],
  }))
  assert.deepEqual(waiting.action, { kind: "dispatch_role", role: "executor", taskKey: "task-2" })

  const resumed = nextCoordinatorAction(input("execution", {
    roleSessions: [session("executor", "mvs-executor")],
    tasks: [task("task-1", "completed"), task("task-2", "pending", ["task-1"])],
  }))
  assert.equal(resumed.action.kind, "resume_role")

  const frozen = nextCoordinatorAction(input("execution", {
    tasks: [task("task-1", "completed"), task("task-2", "completed", ["task-1"])],
  }))
  assert.deepEqual(frozen.action, { kind: "control_plane", operation: "freeze_candidate" })
})

test("quick execution dispatches once, then freezes from the durable executor binding", () => {
  assert.deepEqual(nextCoordinatorAction(input("quick_execution")).action, {
    kind: "dispatch_role",
    role: "executor",
    taskKey: null,
  })
  assert.deepEqual(nextCoordinatorAction(input("quick_execution", {
    roleSessions: [session("executor", "mvs-executor")],
  })).action, { kind: "control_plane", operation: "freeze_candidate" })
})

test("reviewers start blind and a missing verdict resumes only its bound session", () => {
  const blind = nextCoordinatorAction(input("independent_reviews"))
  assert.deepEqual(blind.action, {
    blind: true,
    kind: "dispatch_reviews",
    roles: ["functional_reviewer", "security_reviewer"],
  })
  const partial = nextCoordinatorAction(input("independent_reviews", {
    reviews: [{ role: "functional_reviewer" }],
    roleSessions: [
      session("functional_reviewer", "mvs-functional", "c1"),
      session("security_reviewer", "mvs-security", "c1"),
    ],
  }))
  assert.deepEqual(partial.action, {
    kind: "resume_role",
    role: "security_reviewer",
    sessionId: "mvs-security",
    taskKey: null,
  })
})

test("repaired candidates never resume a reviewer session from an older candidate", () => {
  const decision = nextCoordinatorAction(input("independent_reviews", {
    roleSessions: [
      session("functional_reviewer", "mvs-old-functional", "old-candidate"),
      session("security_reviewer", "mvs-old-security", "old-candidate"),
    ],
  }))
  assert.equal(decision.action.kind, "dispatch_reviews")
})

test("verification, arbitration, repair, delivery and terminal states return one bounded action", () => {
  assert.deepEqual(nextCoordinatorAction(input("verification")).action, {
    kind: "control_plane",
    operation: "verify",
  })
  assert.deepEqual(nextCoordinatorAction(input("arbitration")).action, {
    kind: "dispatch_role",
    role: "arbiter",
    taskKey: null,
  })
  assert.deepEqual(nextCoordinatorAction(input("repair")).action, {
    kind: "control_plane",
    operation: "retry",
  })
  assert.deepEqual(nextCoordinatorAction(input("delivery")).action, {
    kind: "control_plane",
    operation: "deliver",
  })
  for (const state of ["paused", "blocked", "completed", "cancelled"] as const) {
    assert.equal(nextCoordinatorAction(input(state)).action.kind, "stop", state)
  }
})
