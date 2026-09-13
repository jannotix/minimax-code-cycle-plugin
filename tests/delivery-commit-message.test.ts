import assert from "node:assert/strict"
import { test } from "node:test"

import type { CandidateManifest } from "../src/evidence/candidate.ts"
import { commitMessage } from "../src/evidence/delivery.ts"

const manifest = (evidenceIds: readonly string[]): CandidateManifest => ({
  baseRevision: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c",
  candidateDigest: "a".repeat(64),
  configurationDigest: "b".repeat(64),
  dependencyStateDigest: "c".repeat(64),
  diffDigest: "d".repeat(64),
  environmentDigest: "e".repeat(64),
  evidenceIds: [...evidenceIds],
  files: [],
})

test("the commit records whether anyone checked the capability boundary", () => {
  const request = "Add rate limiting to the public API"
  const gates = manifest(["e1", "e2", "e3"])

  // A commit outlives its workflow and is read by people who were not here. It must never imply a
  // boundary was enforced when nobody could see whether it was.
  const unproven = commitMessage(request, gates, "w1", "unverified-on-host")
  assert.match(unproven, /^Cycle-capability-enforcement: unverified-on-host$/mu)

  const proven = commitMessage(request, gates, "w1", "verified")
  assert.match(proven, /^Cycle-capability-enforcement: verified$/mu)

  // No receipt shown means the commit says nothing about enforcement, rather than defaulting to
  // the reassuring answer.
  const silent = commitMessage(request, gates, "w1")
  assert.doesNotMatch(silent, /capability-enforcement/iu)

  // The existing trailers are untouched, and the gate count is still the real one.
  for (const message of [unproven, proven, silent]) {
    assert.match(message, /^Base-revision: 0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c$/mu)
    assert.match(message, /^Cycle-workflow: w1$/mu)
    assert.match(message, /on 3 recorded gates/u)
    assert.equal(message.split("\n")[0], request)
  }
})
