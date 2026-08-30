import assert from "node:assert/strict"
import { test } from "node:test"

import { Database } from "../src/store/database.ts"
import {
  bindRoleSession,
  candidateReviewerSessions,
  roleSessions,
  RoleSessionRejected,
} from "../src/store/role-sessions.ts"

function fixture(): Database {
  const database = new Database({ path: ":memory:" })
  database.run(
    "insert into workflows (id, project_id, state, max_repair_cycles, created_at, updated_at) values ('w1','p','independent_reviews',5,1,1)",
  )
  for (const candidate of ["c1", "c2"]) {
    database.run(
      "insert into candidates (id, workflow_id, manifest, diff_digest, candidate_digest, frozen_at) values (?, 'w1', '{}', 'd', ?, 1)",
      candidate,
      candidate,
    )
  }
  return database
}

test("one native session can serve only one workflow role", () => {
  const database = fixture()
  try {
    const architect = bindRoleSession(database, "w1", null, "architect", "mvs-architect", 1)
    assert.equal(architect.sessionId, "mvs-architect")
    assert.equal(
      bindRoleSession(database, "w1", null, "architect", "mvs-architect", 2).boundAt,
      1,
      "rebinding the same role/session is idempotent",
    )
    assert.throws(
      () => bindRoleSession(database, "w1", null, "executor", "mvs-architect", 2),
      RoleSessionRejected,
    )
    assert.throws(
      () => bindRoleSession(database, "w1", null, "architect", "mvs-another-architect", 2),
      /originally bound/u,
    )
  } finally {
    database.close()
  }
})

test("independent reviewers bind distinct sessions exactly once per candidate", () => {
  const database = fixture()
  try {
    bindRoleSession(database, "w1", "c1", "functional_reviewer", "mvs-functional", 1)
    bindRoleSession(database, "w1", "c1", "security_reviewer", "mvs-security", 2)
    assert.deepEqual(candidateReviewerSessions(database, "w1", "c1"), {
      functional: "mvs-functional",
      security: "mvs-security",
    })
    assert.throws(
      () => bindRoleSession(database, "w1", "c1", "functional_reviewer", "mvs-functional-other", 3),
      /originally bound/u,
    )
    assert.throws(
      () => bindRoleSession(database, "w1", "c2", "functional_reviewer", "mvs-functional", 3),
      /fresh native session/u,
    )
    assert.equal(candidateReviewerSessions(database, "w1", "c2"), null)
  } finally {
    database.close()
  }
})

test("candidate roles require a matching candidate and bindings cascade with the workflow", () => {
  const database = fixture()
  try {
    assert.throws(
      () => bindRoleSession(database, "w1", null, "arbiter", "mvs-arbiter", 1),
      /requires a frozen candidate/u,
    )
    assert.throws(
      () => bindRoleSession(database, "w1", "missing", "arbiter", "mvs-arbiter", 1),
      /does not belong/u,
    )
    bindRoleSession(database, "w1", "c1", "arbiter", "mvs-arbiter", 1)
    assert.equal(roleSessions(database, "w1").length, 1)
    database.run("delete from workflows where id = 'w1'")
    assert.deepEqual(roleSessions(database, "w1"), [])
  } finally {
    database.close()
  }
})
