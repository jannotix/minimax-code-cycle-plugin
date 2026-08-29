import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { diagnose } from "../src/diagnostics.ts"
import { Runtime } from "../src/runtime.ts"
import { verifyCheckpoints } from "../src/store/checkpoints.ts"
import { readHistory, verifyHistory } from "../src/store/history.ts"
import {
  amendWorkflow,
  controlWorkflow,
  startWorkflow,
  workflowStatus,
} from "../src/workflow/service.ts"

test("a workflow survives restart, stays project-scoped, and signs cancellation", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "cycle-minimax-runtime-"))
  const projectA = join(scratch, "project-a")
  const projectB = join(scratch, "project-b")
  const data = join(scratch, "data")
  const { mkdirSync } = await import("node:fs")
  mkdirSync(projectA)
  mkdirSync(projectB)
  const environment = { ...process.env, CYCLE_DATA_DIR: data }

  const first = new Runtime(environment)
  try {
    const started = startWorkflow(first, {
      preference: "auto",
      projectRoot: projectA,
      request: "Implement payment authorization with an audit trail",
    }, 1_000)
    assert.equal(started.workflow.mode, "full")
    assert.equal(started.workflow.state, "architecture")
    assert.equal(started.deduplicated, false)

    const duplicate = startWorkflow(first, {
      preference: "auto",
      projectRoot: projectA,
      request: "Implement payment authorization with an audit trail",
    }, 1_001)
    assert.equal(duplicate.workflow.id, started.workflow.id)
    assert.equal(duplicate.deduplicated, true)

    assert.throws(
      () => workflowStatus(first, projectB, started.workflow.id),
      /does not belong to project_root/u,
    )

    const paused = controlWorkflow(first, projectA, started.workflow.id, "pause", {}, 1_002)
    assert.equal(paused.workflow.state, "paused")
    const resumed = controlWorkflow(first, projectA, started.workflow.id, "resume", {}, 1_003)
    assert.equal(resumed.workflow.state, "architecture")

    const amended = amendWorkflow(first, projectA, started.workflow.id, "Use the existing ledger", 1_004)
    assert.equal(amended.request?.originalText, "Implement payment authorization with an audit trail")
    assert.deepEqual(amended.request?.amendments.map((entry) => entry.text), ["Use the existing ledger"])

    assert.throws(
      () => controlWorkflow(first, projectA, started.workflow.id, "cancel"),
      /confirm: true/u,
    )
    const cancelled = controlWorkflow(
      first,
      projectA,
      started.workflow.id,
      "cancel",
      { confirm: true, reason: "test cleanup" },
      1_005,
    )
    assert.equal(cancelled.workflow.state, "cancelled")
    assert.equal(verifyHistory(first.requireStore()).valid, true)
    assert.deepEqual(verifyCheckpoints(first.requireStore()), { checked: 1, head: 6, valid: true })
    assert.equal(readHistory(first.requireStore(), first.project(projectA).id, null, 100).length, 7)
  } finally {
    first.close()
  }

  const second = new Runtime(environment)
  try {
    const restored = workflowStatus(second, projectA)
    assert.equal(restored?.workflow.state, "cancelled")
    assert.equal(restored?.request?.originalText, "Implement payment authorization with an audit trail")
    const next = startWorkflow(second, {
      projectRoot: projectA,
      request: "Implement payment authorization with an audit trail",
    }, 2_000)
    assert.notEqual(next.workflow.id, restored?.workflow.id)

    const doctor = await diagnose(second, projectA, "test") as { ok: boolean; store: { schemaVersion: number } }
    assert.equal(doctor.ok, true)
    assert.equal(doctor.store.schemaVersion, 7)
  } finally {
    second.close()
    rmSync(scratch, { force: true, recursive: true })
  }
})

test("configuration rejects an invalid repair budget without trusting it", () => {
  const scratch = mkdtempSync(join(tmpdir(), "cycle-minimax-config-"))
  const runtime = new Runtime({
    ...process.env,
    CYCLE_DATA_DIR: join(scratch, "data"),
    CYCLE_MAX_REPAIR_CYCLES: "0",
  })
  try {
    assert.equal(runtime.configuration.maxRepairCycles, 5)
    assert.deepEqual(runtime.configuration.invalid, [
      "CYCLE_MAX_REPAIR_CYCLES must be an integer between 1 and 20",
    ])
  } finally {
    runtime.close()
    rmSync(scratch, { force: true, recursive: true })
  }
})

test("workflow text fields are bounded before they reach durable history", () => {
  const scratch = mkdtempSync(join(tmpdir(), "cycle-minimax-bounds-"))
  const project = join(scratch, "project")
  mkdirSync(project)
  const runtime = new Runtime({ ...process.env, CYCLE_DATA_DIR: join(scratch, "data") })
  try {
    assert.throws(
      () => startWorkflow(runtime, { projectRoot: project, request: "x".repeat(1024 * 1024 + 1) }),
      /request exceeds/u,
    )
    const workflow = startWorkflow(runtime, { projectRoot: project, request: "bounded" }).workflow
    assert.throws(
      () => amendWorkflow(runtime, project, workflow.id, "x".repeat(64 * 1024 + 1)),
      /amendment exceeds/u,
    )
    assert.throws(
      () => controlWorkflow(runtime, project, workflow.id, "pause", { reason: "x".repeat(4097) }),
      /reason exceeds/u,
    )
  } finally {
    runtime.close()
    rmSync(scratch, { force: true, recursive: true })
  }
})

test("workflow operations refuse a durable data directory inside the project", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "cycle-minimax-inside-"))
  const runtime = new Runtime({ ...process.env, CYCLE_DATA_DIR: join(scratch, ".cycle-data") })
  try {
    assert.throws(
      () => startWorkflow(runtime, { projectRoot: scratch, request: "do work" }),
      /must be outside project_root/u,
    )
    const doctor = await diagnose(runtime, scratch, "test") as {
      findings: readonly { code: string }[]
      ok: boolean
    }
    assert.equal(doctor.ok, false)
    assert.ok(doctor.findings.some((finding) => finding.code === "storage.inside_project"))
    assert.equal(existsSync(join(scratch, ".cycle-data")), false)
  } finally {
    runtime.close()
    rmSync(scratch, { force: true, recursive: true })
  }
})
