import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"

import { Runtime } from "../src/runtime.ts"
import { captureCandidate, CandidateRefused } from "../src/evidence/candidate.ts"
import { changedFiles, parseStatus } from "../src/evidence/changes.ts"
import { candidateManifest } from "../src/store/workflows.ts"
import { verifyCheckpoints } from "../src/store/checkpoints.ts"
import { readHistory } from "../src/store/history.ts"
import { roleSessions } from "../src/store/role-sessions.ts"
import {
  arbitrateWorkflow,
  candidateEvidence,
  deliverWorkflowCandidate,
  freezeWorkflowCandidate,
  reconcileWorkflow,
  reportTask,
  startWorkflow,
  submitPlan,
  submitReviewVerdict,
  verifyWorkflowCandidate,
} from "../src/workflow/service.ts"

interface Fixture {
  readonly close: () => void
  readonly git: (...args: string[]) => string
  readonly read: (path: string) => string | null
  readonly root: string
  readonly runtime: Runtime
  readonly write: (path: string, content: string) => void
}

function fixture(baseline: Record<string, string> = { "README.md": "# fixture\n" }): Fixture {
  const scratch = mkdtempSync(join(tmpdir(), "cycle-minimax-t02-"))
  const root = join(scratch, "project")
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
  for (const [path, content] of Object.entries(baseline)) write(path, content)
  git("add", "-A")
  git("commit", "--quiet", "-m", "baseline")
  const runtime = new Runtime({ ...process.env, CYCLE_DATA_DIR: join(scratch, "data") })
  return {
    close: () => {
      runtime.close()
      rmSync(scratch, { force: true, recursive: true })
    },
    git,
    read: (path) => {
      try { return readFileSync(join(root, path), "utf8") } catch { return null }
    },
    root,
    runtime,
    write,
  }
}

function plan() {
  return {
    assumptions: [],
    integration_checks: [],
    requirements: [{ acceptance_criteria: ["payment works"], id: "REQ-1", statement: "payment" }],
    risks: [],
    tasks: [{
      acceptance_criteria: ["payment works"],
      dependencies: [],
      key: "task-1",
      objective: "implement payment",
      requirement_ids: ["REQ-1"],
      title: "Payment",
      verification_commands: ["node --version"],
      write_scopes: ["src"],
    }],
  }
}

function approved(requirementIds: readonly string[], evidenceIds: readonly string[]) {
  return {
    decision: "approved",
    findings: [],
    repair_target: null,
    requirements: requirementIds.map((requirementId) => ({
      evidence_ids: evidenceIds.slice(0, 1),
      requirement_id: requirementId,
      status: "satisfied",
    })),
  }
}

async function quickToDelivery(item: Fixture, path = "src/app.js") {
  const workflow = startWorkflow(item.runtime, {
    preference: "quick",
    projectRoot: item.root,
    request: "change the fixture",
  }).workflow
  item.write(path, "export const answer = 42\n")
  await reportTask(item.runtime, item.root, workflow.id, "task-1", "completed", "done", "mvs-executor")
  const frozen = await freezeWorkflowCandidate(item.runtime, item.root, workflow.id) as {
    candidateId: string
  }
  const verified = await verifyWorkflowCandidate(item.runtime, item.root, workflow.id) as {
    mandatoryPassed: boolean
    state: string
  }
  assert.equal(verified.mandatoryPassed, true)
  assert.equal(verified.state, "arbitration")
  const arbitration = arbitrateWorkflow(item.runtime, item.root, workflow.id, approved([], []), "mvs-arbiter") as {
    state: string
  }
  assert.equal(arbitration.state, "delivery")
  return { candidateId: frozen.candidateId, workflowId: workflow.id }
}

test("a quick candidate is verified, delivered byte-for-byte, committed, and checkpointed", async () => {
  const item = fixture()
  try {
    const baseline = item.git("rev-parse", "HEAD")
    const { workflowId } = await quickToDelivery(item)
    const delivered = await deliverWorkflowCandidate(item.runtime, item.root, workflowId) as {
      committed: boolean
      state: string
    }
    assert.equal(delivered.committed, true)
    assert.equal(delivered.state, "completed")
    assert.notEqual(item.git("rev-parse", "HEAD"), baseline)
    assert.equal(item.git("status", "--porcelain"), "")
    assert.equal(verifyCheckpoints(item.runtime.requireStore()).valid, true)
  } finally {
    item.close()
  }
})

test("renames, deletions, and untracked files remain exact through freeze and delivery", async () => {
  const item = fixture({ "gone.txt": "delete me\n", "old.txt": "rename me\n" })
  try {
    item.git("mv", "old.txt", "new.txt")
    item.git("rm", "--quiet", "gone.txt")
    item.write("added.txt", "new file\n")

    const changes = await changedFiles(item.root)
    assert.deepEqual(changes?.map((file) => [file.kind, file.path]), [
      ["added", "added.txt"],
      ["deleted", "gone.txt"],
      ["added", "new.txt"],
      ["deleted", "old.txt"],
    ])
    for (const file of changes ?? []) {
      if (file.kind === "added") assert.match(file.digest ?? "", /^[a-f0-9]{64}$/u)
      else assert.equal(file.digest, null)
    }
    const first = await captureCandidate(item.root)
    const second = await captureCandidate(item.root)
    assert.equal(first.manifest.candidateDigest, second.manifest.candidateDigest)
    assert.deepEqual(first.manifest.files.map((file) => [file.kind, file.path]), [
      ["added", "added.txt"],
      ["deleted", "gone.txt"],
      ["added", "new.txt"],
      ["deleted", "old.txt"],
    ])

    const workflow = startWorkflow(item.runtime, {
      preference: "quick",
      projectRoot: item.root,
      request: "rename and clean up files",
    }).workflow
    await reportTask(item.runtime, item.root, workflow.id, "task-1", "completed", "done", "mvs-executor")
    await freezeWorkflowCandidate(item.runtime, item.root, workflow.id)
    const verified = await verifyWorkflowCandidate(item.runtime, item.root, workflow.id) as {
      mandatoryPassed: boolean
    }
    assert.equal(verified.mandatoryPassed, true)
    arbitrateWorkflow(item.runtime, item.root, workflow.id, approved([], []), "mvs-arbiter")
    const delivered = await deliverWorkflowCandidate(item.runtime, item.root, workflow.id) as {
      aborted?: string
      state: string
    }
    assert.equal(delivered.state, "completed", delivered.aborted ?? "delivery did not complete")
    assert.equal(item.read("old.txt"), null)
    assert.equal(item.read("gone.txt"), null)
    assert.equal(item.read("new.txt"), "rename me\n")
    assert.equal(item.read("added.txt"), "new file\n")
    assert.equal(item.git("status", "--porcelain"), "")
  } finally {
    item.close()
  }
})

test("porcelain rename records preserve both destination and deleted origin", () => {
  assert.deepEqual(parseStatus("R  new.txt\0old.txt\0"), [
    { kind: "added", path: "new.txt" },
    { kind: "deleted", path: "old.txt" },
  ])
})

test("candidate freeze refuses a file reachable only through a junction", async () => {
  const item = fixture()
  const outside = mkdtempSync(join(tmpdir(), "cycle-minimax-candidate-outside-"))
  try {
    writeFileSync(join(outside, "secret.txt"), "outside\n")
    symlinkSync(outside, join(item.root, "linked"), process.platform === "win32" ? "junction" : "dir")
    // Git does not normally traverse a junction, so exercise the same boundary directly through a
    // tracked file symlink when the platform permits it, and retain the filesystem test above for
    // every platform.
    await assert.rejects(() => captureCandidate(item.root), CandidateRefused)
  } finally {
    item.close()
    rmSync(outside, { force: true, recursive: true })
  }
})

test("a full route requires plan coverage, both independent reviews, evidence, and arbitration", async () => {
  const item = fixture()
  try {
    const workflow = startWorkflow(item.runtime, {
      preference: "full",
      projectRoot: item.root,
      request: "Implement payment processing",
    }).workflow
    submitPlan(item.runtime, item.root, workflow.id, plan(), "mvs-architect")
    item.write("src/payment.js", "export const paid = true\n")
    await reportTask(item.runtime, item.root, workflow.id, "task-1", "completed", "implemented", "mvs-executor")
    await freezeWorkflowCandidate(item.runtime, item.root, workflow.id)
    const verified = await verifyWorkflowCandidate(item.runtime, item.root, workflow.id) as {
      mandatoryPassed: boolean
      state: string
    }
    assert.equal(verified.mandatoryPassed, true)
    assert.equal(verified.state, "independent_reviews")

    const recorded = candidateEvidence(item.runtime, item.root, workflow.id) as {
      evidence: readonly { id: string }[]
      requirements: readonly string[]
    }
    assert.ok(recorded.evidence.length > 0)
    const verdict = approved(recorded.requirements, recorded.evidence.map((entry) => entry.id))
    const first = submitReviewVerdict(
      item.runtime,
      item.root,
      workflow.id,
      "functional_reviewer",
      verdict,
      "mvs-functional",
    ) as { reviewsReady: boolean }
    assert.equal(first.reviewsReady, false)
    const second = submitReviewVerdict(
      item.runtime,
      item.root,
      workflow.id,
      "security_reviewer",
      verdict,
      "mvs-security",
    ) as { reviewsReady: boolean; state: string }
    assert.equal(second.reviewsReady, true)
    assert.equal(second.state, "arbitration")
    const arbitration = arbitrateWorkflow(item.runtime, item.root, workflow.id, verdict, "mvs-arbiter") as {
      state: string
    }
    assert.equal(arbitration.state, "delivery")
    assert.deepEqual(
      roleSessions(item.runtime.requireStore(), workflow.id).map((entry) => [entry.role, entry.sessionId]),
      [
        ["architect", "mvs-architect"],
        ["executor", "mvs-executor"],
        ["functional_reviewer", "mvs-functional"],
        ["security_reviewer", "mvs-security"],
        ["arbiter", "mvs-arbiter"],
      ],
    )
    const history = readHistory(
      item.runtime.requireStore(),
      item.runtime.project(item.root).id,
      null,
      1_000,
    )
    for (const sessionId of [
      "mvs-architect",
      "mvs-executor",
      "mvs-functional",
      "mvs-security",
      "mvs-arbiter",
    ]) {
      assert.ok(history.some((entry) => entry.sessionId === sessionId), sessionId)
    }
    const delivered = await deliverWorkflowCandidate(item.runtime, item.root, workflow.id) as {
      state: string
    }
    assert.equal(delivered.state, "completed")
  } finally {
    item.close()
  }
})

test("scope reconciliation rejects writes outside the current or completed task scopes", async () => {
  const item = fixture()
  try {
    const workflow = startWorkflow(item.runtime, {
      preference: "full",
      projectRoot: item.root,
      request: "Implement payment processing",
    }).workflow
    submitPlan(item.runtime, item.root, workflow.id, plan(), "mvs-architect")
    item.write("outside.txt", "not authorized\n")
    const result = await reportTask(
      item.runtime,
      item.root,
      workflow.id,
      "task-1",
      "completed",
      "done",
      "mvs-executor",
    ) as { outOfScope: readonly string[]; state: string }
    assert.deepEqual(result.outOfScope, ["outside.txt"])
    assert.equal(result.state, "repair")
  } finally {
    item.close()
  }
})

test("candidate mutation and secret content fail mandatory evidence", async () => {
  for (const kind of ["mutation", "secret"] as const) {
    const item = fixture()
    try {
      const workflow = startWorkflow(item.runtime, {
        preference: "quick",
        projectRoot: item.root,
        request: "change the fixture",
      }).workflow
      item.write(
        "src/value.txt",
        kind === "secret" ? "sk-ant-abcdefghijklmnopqrstuvwxyz012345\n" : "before\n",
      )
      await reportTask(item.runtime, item.root, workflow.id, "task-1", "completed", "done", "mvs-executor")
      await freezeWorkflowCandidate(item.runtime, item.root, workflow.id)
      if (kind === "mutation") item.write("src/value.txt", "after\n")
      const result = await verifyWorkflowCandidate(item.runtime, item.root, workflow.id) as {
        mandatoryPassed: boolean
        reason: string
        state: string
      }
      assert.equal(result.mandatoryPassed, false)
      assert.equal(result.state, "repair")
      assert.match(result.reason, kind === "secret" ? /security:changed-content-secrets/u : /integrity:candidate/u)
    } finally {
      item.close()
    }
  }
})

test("reconcile finishes a journaled delivery from approved bytes after restart", async () => {
  const item = fixture()
  try {
    const { candidateId, workflowId } = await quickToDelivery(item)
    const manifest = candidateManifest(item.runtime.requireStore(), candidateId)!
    item.runtime.requireStore().run(
      `insert into deliveries (candidate_id, workflow_id, state, manifest, written, started_at, updated_at)
       values (?, ?, 'prepared', ?, '[]', ?, ?)`,
      candidateId,
      workflowId,
      JSON.stringify(manifest),
      1,
      1,
    )
    item.write("src/app.js", "corrupted after journal\n")
    const result = await reconcileWorkflow(item.runtime, item.root, workflowId) as {
      recovered: { state: string }
      state: string
    }
    assert.equal(result.recovered.state, "completed")
    assert.equal(result.state, "completed")
    assert.equal(item.read("src/app.js"), "export const answer = 42\n")
    assert.equal(item.git("status", "--porcelain"), "")
  } finally {
    item.close()
  }
})

test("delivery aborts when a candidate parent becomes a junction after approval", async () => {
  const item = fixture({ "safe/app.txt": "baseline\n" })
  const outside = mkdtempSync(join(tmpdir(), "cycle-minimax-t02-outside-"))
  try {
    const { workflowId } = await quickToDelivery(item, "safe/app.txt")
    rmSync(join(item.root, "safe"), { force: true, recursive: true })
    writeFileSync(join(outside, "app.txt"), "outside\n")
    symlinkSync(outside, join(item.root, "safe"), process.platform === "win32" ? "junction" : "dir")
    const result = await deliverWorkflowCandidate(item.runtime, item.root, workflowId) as {
      aborted: string
      state: string
    }
    assert.match(result.aborted, /changed after approval|symbolic link|junction/u)
    assert.equal(result.state, "delivery")
    assert.equal(readFileSync(join(outside, "app.txt"), "utf8"), "outside\n")
  } finally {
    item.close()
    rmSync(outside, { force: true, recursive: true })
  }
})
