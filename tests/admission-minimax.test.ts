import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { AdmissionController, activeLeases, release } from "../src/admission.ts"
import { Runtime } from "../src/runtime.ts"
import { startWorkflow } from "../src/workflow/service.ts"

const healthy = {
  availableDiskBytes: 20 * 1024 ** 3,
  availableMemoryBytes: 8 * 1024 ** 3,
  cpuLoad: 0.2,
}

test("admission leases renew, release, expire, and fail closed on resource pressure", () => {
  const scratch = mkdtempSync(join(tmpdir(), "cycle-minimax-admission-"))
  const project = join(scratch, "project")
  mkdirSync(project)
  const runtime = new Runtime({ ...process.env, CYCLE_DATA_DIR: join(scratch, "data") })
  const controller = new AdmissionController({
    backpressureAdmissions: 1,
    leaseSeconds: 15,
    maxActive: 2,
    renewSeconds: 5,
    reserves: {
      cpuCeiling: 0.85,
      diskReserveBytes: 2 * 1024 ** 3,
      memoryReserveBytes: 1024 ** 3,
    },
  })

  try {
    const workflow = startWorkflow(runtime, {
      projectRoot: project,
      request: "Fix a local typo",
    }, 1_000).workflow
    const database = runtime.requireStore()

    const admitted = controller.request(database, workflow.projectId, workflow.id, healthy, 2_000)
    assert.equal(admitted.admitted, true)
    assert.equal(activeLeases(database).length, 1)

    const renewed = controller.renew(database, workflow.id, 3_000)
    assert.equal(renewed.admitted, true)
    assert.ok((renewed.expiresAt ?? 0) > (admitted.expiresAt ?? 0))

    release(database, workflow.id)
    assert.equal(activeLeases(database).length, 0)

    const pressured = controller.request(
      database,
      workflow.projectId,
      workflow.id,
      { ...healthy, availableMemoryBytes: 1 },
      4_000,
    )
    assert.equal(pressured.admitted, false)
    assert.match(pressured.reason, /memory/u)
  } finally {
    runtime.close()
    rmSync(scratch, { force: true, recursive: true })
  }
})
