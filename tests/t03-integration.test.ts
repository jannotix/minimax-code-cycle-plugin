import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"

import { newGoal, status as goalStatus } from "../src/goals.ts"
import { explain, recall } from "../src/memory.ts"
import { Runtime } from "../src/runtime.ts"
import {
  arbitrateWorkflow,
  deliverWorkflowCandidate,
  freezeWorkflowCandidate,
  reportTask,
  startWorkflow,
  verifyWorkflowCandidate,
} from "../src/workflow/service.ts"

test("delivery persists provenance-backed memory and advances the focused goal across restart", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "cycle-minimax-t03-"))
  const root = join(scratch, "project")
  const dataDirectory = join(scratch, "data")
  mkdirSync(root)
  const git = (...args: string[]): string =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim()
  const write = (path: string, content: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  git("init", "--quiet")
  git("config", "user.email", "fixture@example.invalid")
  git("config", "user.name", "fixture")
  git("config", "core.autocrlf", "false")
  mkdirSync(join(root, ".githooks-empty"))
  git("config", "core.hooksPath", join(root, ".githooks-empty"))
  write("README.md", "# fixture\n")
  git("add", "-A")
  git("commit", "--quiet", "-m", "baseline")

  const environment = { ...process.env, CYCLE_DATA_DIR: dataDirectory }
  const first = new Runtime(environment)
  let second: Runtime | undefined
  try {
    const project = first.project(root)
    const goal = newGoal(
      { database: first.requireStore(), projectId: project.id },
      {
        objective: "make the answer durable",
        successCriteria: ["the approved answer survives a restart"],
      },
    ) as { goalId: string }

    const started = startWorkflow(first, {
      preference: "quick",
      projectRoot: root,
      request: "add the durable answer",
    })
    assert.equal(started.goalId, goal.goalId)

    write("src/answer.ts", "export const answer = 42\n")
    await reportTask(first, root, started.workflow.id, "task-1", "completed", "implemented", "mvs-executor")
    const frozen = await freezeWorkflowCandidate(first, root, started.workflow.id) as {
      candidateId: string
    }
    const verified = await verifyWorkflowCandidate(first, root, started.workflow.id) as {
      mandatoryPassed: boolean
      state: string
    }
    assert.equal(verified.mandatoryPassed, true)
    assert.equal(verified.state, "arbitration")
    const arbitration = arbitrateWorkflow(first, root, started.workflow.id, {
      decision: "approved",
      findings: [],
      repair_target: null,
      requirements: [],
    }, "mvs-arbiter") as { state: string }
    assert.equal(arbitration.state, "delivery")

    const delivered = await deliverWorkflowCandidate(first, root, started.workflow.id) as {
      goal: { blocked: boolean; goalId: string } | null
      memories: string[]
      revision: string
      state: string
    }
    assert.equal(delivered.state, "completed")
    assert.deepEqual(delivered.goal, { blocked: false, goalId: goal.goalId })
    assert.ok(delivered.memories.length >= 1)

    const entries = explain(
      { database: first.requireStore(), projectId: project.id },
      delivered.memories,
    )
    const approval = entries.find((entry) => entry.kind === "approval")
    assert.equal(approval?.confidence, "verified")
    assert.equal(approval?.provenance.candidateId, frozen.candidateId)
    assert.equal(approval?.provenance.revision, delivered.revision)
    assert.ok((approval?.provenance.evidenceIds.length ?? 0) > 0)

    first.close()
    second = new Runtime(environment)
    const afterRestart = { database: second.requireStore(), projectId: second.project(root).id }
    assert.ok(recall(afterRestart, "durable answer").some((entry) => entry.kind === "approval"))
    const restoredGoal = goalStatus(afterRestart, goal.goalId) as {
      continuations: { used: number }
      milestones: { state: string }[]
      state: string
    }
    assert.equal(restoredGoal.state, "active")
    assert.equal(restoredGoal.continuations.used, 1)
    assert.deepEqual(restoredGoal.milestones.map((milestone) => milestone.state), ["completed"])
  } finally {
    second?.close()
    first.close()
    rmSync(scratch, { force: true, recursive: true })
  }
})

test("repair exhaustion records the failed approach through the workflow service", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "cycle-minimax-t03-blocked-"))
  const root = join(scratch, "project")
  mkdirSync(root)
  const git = (...args: string[]): string =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim()
  git("init", "--quiet")
  git("config", "user.email", "fixture@example.invalid")
  git("config", "user.name", "fixture")
  git("config", "core.autocrlf", "false")
  mkdirSync(join(root, ".githooks-empty"))
  git("config", "core.hooksPath", join(root, ".githooks-empty"))
  writeFileSync(join(root, "README.md"), "# fixture\n")
  git("add", "-A")
  git("commit", "--quiet", "-m", "baseline")

  const runtime = new Runtime({
    ...process.env,
    CYCLE_DATA_DIR: join(scratch, "data"),
    CYCLE_MAX_REPAIR_CYCLES: "1",
  })
  try {
    const started = startWorkflow(runtime, {
      preference: "quick",
      projectRoot: root,
      request: "avoid the unsafe credential approach",
    })
    const credentialShape = ["AKIA", "IOSFODNN7EXAMPLE"].join("")
    mkdirSync(join(root, "src"))
    writeFileSync(join(root, "src", "unsafe.ts"), `export const token = "${credentialShape}"\n`)
    await reportTask(runtime, root, started.workflow.id, "task-1", "completed", "attempted", "mvs-executor")
    const frozen = await freezeWorkflowCandidate(runtime, root, started.workflow.id) as {
      candidateId: string
    }
    const verified = await verifyWorkflowCandidate(runtime, root, started.workflow.id) as {
      mandatoryPassed: boolean
      memoryId: string | null
      state: string
    }

    assert.equal(verified.mandatoryPassed, false)
    assert.equal(verified.state, "blocked")
    assert.ok(verified.memoryId)
    const context = { database: runtime.requireStore(), projectId: runtime.project(root).id }
    const [failed] = explain(context, [verified.memoryId!])
    assert.equal(failed?.kind, "failed_approach")
    assert.equal(failed?.confidence, "inferred")
    assert.equal(failed?.provenance.candidateId, frozen.candidateId)
    assert.ok(recall(context, "unsafe credential").some((entry) => entry.id === verified.memoryId))
  } finally {
    runtime.close()
    rmSync(scratch, { force: true, recursive: true })
  }
})
