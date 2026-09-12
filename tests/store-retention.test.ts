import assert from "node:assert/strict"
import { test } from "node:test"

import { Database } from "../src/store/database.ts"
import { pruneCandidateBytes, storeUsage } from "../src/store/retention.ts"

const PROJECT = "retention-project"

interface Seeded {
  readonly candidateId: string
  readonly database: Database
}

/** One workflow in the given state, with one candidate carrying two retained files. */
function seed(database: Database, id: string, state: string, bytes: number): Seeded {
  const candidateId = `${id}-candidate`
  database.run(
    `insert into workflows (id, project_id, state, max_repair_cycles, created_at, updated_at)
     values (?, ?, ?, 5, 1, 1)`,
    id,
    PROJECT,
    state,
  )
  database.run(
    `insert into candidates (id, workflow_id, manifest, diff_digest, candidate_digest, frozen_at)
     values (?, ?, '{}', 'diff-digest', 'candidate-digest', 1)`,
    candidateId,
    id,
  )
  for (const path of ["src/a.ts", "src/b.ts"]) {
    database.run(
      `insert into candidate_files (candidate_id, path, kind, digest, payload)
       values (?, ?, 'added', ?, ?)`,
      candidateId,
      path,
      `digest-of-${path}`,
      Buffer.alloc(bytes, 1),
    )
  }
  return { candidateId, database }
}

function fresh(): Database {
  return new Database({ path: ":memory:" })
}

test("usage separates what is retained from what may be given back", () => {
  const database = fresh()
  try {
    seed(database, "running", "execution", 100)
    seed(database, "finished", "completed", 100)

    const usage = storeUsage(database, PROJECT)
    assert.equal(usage.retained.files, 4, "all four files are retained")
    assert.equal(usage.retained.bytes, 400)
    // Only the finished workflow's two files may go.
    assert.equal(usage.prunable.files, 2)
    assert.equal(usage.prunable.bytes, 200)
    assert.equal(usage.prunable.workflows, 1)
    assert.equal(usage.counts.workflows, 2)
    assert.equal(usage.counts.candidates, 2)
  } finally {
    database.close()
  }
})

// A running workflow keeps its bytes whatever anyone asks: they are the candidate delivery will
// write back, and a retention policy that could take them would be a data-loss policy.
test("a workflow that has not finished keeps its bytes", () => {
  const database = fresh()
  try {
    seed(database, "running", "execution", 100)
    const freed = pruneCandidateBytes(database, PROJECT)
    assert.deepEqual(freed, { bytes: 0, files: 0 })

    const payloads = database.all<{ payload: Uint8Array | null }>(
      "select payload from candidate_files",
    )
    assert.equal(payloads.every((row) => row.payload !== null), true, "nothing was taken")
  } finally {
    database.close()
  }
})

// The whole reason this is safe: the digest outlives the bytes, so what a candidate contained stays
// provable after it stops taking room. A retention that dropped rows would break the chain.
test("pruning frees the bytes and keeps every row, digest and evidence link", () => {
  const database = fresh()
  try {
    const { candidateId } = seed(database, "finished", "completed", 100)
    database.run(
      `insert into evidence (id, candidate_id, gate_name, kind, status, mandatory, invocation,
                             started_at, finished_at, output_digest)
       values ('e1', ?, 'build', 'command', 'passed', 1, 'npm run build', 1, 2, 'output-digest')`,
      candidateId,
    )

    const freed = pruneCandidateBytes(database, PROJECT)
    assert.deepEqual(freed, { bytes: 200, files: 2 })

    const rows = database.all<{ digest: string; path: string; payload: Uint8Array | null }>(
      "select path, digest, payload from candidate_files where candidate_id = ? order by path",
      candidateId,
    )
    assert.equal(rows.length, 2, "the rows stay")
    assert.deepEqual(rows.map((row) => row.digest), ["digest-of-src/a.ts", "digest-of-src/b.ts"])
    assert.equal(rows.every((row) => row.payload === null), true, "only the bytes went")

    const candidate = database.get<{ candidate_digest: string }>(
      "select candidate_digest from candidates where id = ?",
      candidateId,
    )
    assert.equal(candidate?.candidate_digest, "candidate-digest", "the candidate is still there")
    assert.equal(
      database.get<{ total: number }>("select count(*) as total from evidence")?.total,
      1,
      "the evidence against it is untouched",
    )
  } finally {
    database.close()
  }
})

test("pruning twice gives back nothing the second time", () => {
  const database = fresh()
  try {
    seed(database, "finished", "completed", 100)
    assert.equal(pruneCandidateBytes(database, PROJECT).files, 2)
    assert.deepEqual(pruneCandidateBytes(database, PROJECT), { bytes: 0, files: 0 })
  } finally {
    database.close()
  }
})

// Retention is per project, like everything else the store holds.
test("another project's bytes are not touched", () => {
  const database = fresh()
  try {
    seed(database, "finished", "completed", 100)
    database.run(
      `insert into workflows (id, project_id, state, max_repair_cycles, created_at, updated_at)
       values ('other', 'a-different-project', 'completed', 5, 1, 1)`,
    )
    database.run(
      `insert into candidates (id, workflow_id, manifest, diff_digest, candidate_digest, frozen_at)
       values ('other-candidate', 'other', '{}', 'd', 'c', 1)`,
    )
    database.run(
      `insert into candidate_files (candidate_id, path, kind, digest, payload)
       values ('other-candidate', 'src/x.ts', 'added', 'dx', ?)`,
      Buffer.alloc(50, 1),
    )

    pruneCandidateBytes(database, PROJECT)
    const other = database.get<{ payload: Uint8Array | null }>(
      "select payload from candidate_files where candidate_id = 'other-candidate'",
    )
    assert.notEqual(other?.payload, null, "the other project keeps its bytes")
  } finally {
    database.close()
  }
})
