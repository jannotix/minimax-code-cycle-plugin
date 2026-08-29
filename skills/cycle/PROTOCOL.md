# Protocol

> Legacy design input. This document is not the active runtime contract for `2.0.0-alpha.4`.
> See `../../PRODUCTION_RELEASE_PLAN.md`. No workflow state described below may be
> reported as implemented until its production task and exact-revision evidence are complete.

The text below records the intended v1 workflow and remains useful as a migration input. It is not
normative for the current MiniMax Agent Plugin.

## States

A workflow is in exactly one of these states at any moment:

| State | Meaning |
|---|---|
| `intake` | Original request captured, routing decision pending |
| `architecture` | Architect producing a plan |
| `execution` | Executor implementing one or more tasks |
| `verification` | Real verification commands running, evidence being collected |
| `independent_reviews` | Both reviewers finalizing, no contact between them |
| `arbitration` | Arbiter evaluating the candidate |
| `delivery` | Approved candidate being promoted to the project tree |
| `repair` | Executor reworking the previous attempt with feedback |
| `replan` | Architect rebuilding the plan after a structural failure |
| `paused` | User-initiated pause at the next safe boundary |
| `blocked` | Five repair cycles exhausted, requires user action |
| `cancelled` | User cancelled, audit preserved up to the point of cancellation |
| `completed` | Delivery finished, all events signed |

A state is durable. It is recorded in the audit ledger before the workflow
moves to the next state. If the host crashes, the state is recoverable from
the ledger on the next `/cycle:resume`.

## Transitions

```
intake           -> architecture    (always; quick skips via plan, see below)
intake           -> execution       (quick mode; architect consulted if requested)
architecture     -> execution       (plan accepted)
architecture     -> replan          (5 attempts max, then intake restart)
execution        -> verification    (all bounded tasks complete)
execution        -> plan_defect     (executor reports unrecoverable plan issue)
execution        -> blocked         (5 repair cycles exhausted)
verification     -> independent_reviews (full mode)
verification     -> arbitration     (quick mode)
verification     -> repair          (mandatory gates failed)
independent_reviews -> arbitration  (both reviewers finalized)
arbitration      -> delivery        (approved)
arbitration      -> repair          (rejected, within budget)
arbitration      -> replan          (rejected, structural failure)
arbitration      -> blocked         (rejected, budget exhausted)
delivery         -> completed       (promotion confirmed)
paused           -> <previous>      (user resumed)
```

Every transition writes one ledger event of type `state_transition` with
`from`, `to`, `reason`, and the authorizing agent or user action.

## Original request

The original request is captured at `intake` and is immutable from that
moment. Any clarification from the user becomes an `amendment` event
appended to the ledger. The arbiter evaluates the original request plus all
amendments. The architect and the executor do not need the amendments but
may receive them as context.

## Plan format

A plan is a JSON document with the following shape:

```json
{
  "schema": "cycle.plan.v1",
  "id": "<uuid>",
  "request_digest": "<sha256 of original request>",
  "constraints": ["<string>", ...],
  "non_goals": ["<string>", ...],
  "requirements": [
    {
      "id": "R1",
      "statement": "<string>",
      "acceptance_criteria": ["<string>", ...]
    }
  ],
  "tasks": [
    {
      "key": "T1",
      "title": "<string>",
      "objective": "<string>",
      "requirement_ids": ["R1"],
      "write_scopes": ["src/api/**", "tests/api/**"],
      "dependencies": ["T0"],
      "verification_commands": ["<string>", ...],
      "acceptance_criteria": ["<string>", ...]
    }
  ],
  "risks": [
    {
      "id": "r1",
      "description": "<string>",
      "mitigation": "<string>"
    }
  ],
  "assumptions": ["<string>", ...]
}
```

The plan is validated by `scripts/inspect-ledger.mjs plan <path>`. The
executor rejects a plan that fails validation. The architect is given the
validation error and asked to produce a corrected plan.

## Candidate freeze

After execution, the executor produces a candidate. A candidate is the
exact set of file changes produced by the bounded tasks. The freeze step
produces a manifest:

```json
{
  "schema": "cycle.candidate.v1",
  "id": "<uuid>",
  "workflow_id": "<uuid>",
  "base_revision": "<git revision>",
  "frozen_at_unix_millis": <int>,
  "manifest": [
    {
      "path": "src/api/users.ts",
      "operation": "modified",
      "sha256": "<hex>",
      "size_bytes": <int>
    }
  ],
  "candidate_digest": "<sha256 of canonical manifest>"
}
```

`scripts/freeze-candidate.mjs` produces this file from a worktree and the
base revision. The reviewers and the arbiter read the manifest, not the
working tree, so they always see exactly the candidate under review.

## Evidence record

Evidence is collected during `verification`. Each evidence item is:

```json
{
  "schema": "cycle.evidence.v1",
  "id": "<uuid>",
  "candidate_id": "<uuid>",
  "kind": "<build | test | lint | typecheck | browser | static-analysis | manual>",
  "command": "<string>",
  "exit_code": <int>,
  "started_at_unix_millis": <int>,
  "duration_ms": <int>,
  "output_digest": "<sha256 of output bytes>",
  "status": "passed | failed | skipped",
  "notes": "<string>"
}
```

`status` is `passed` only when `exit_code == 0` and no fatal signal in the
output digest. A reviewer or the arbiter can re-verify by replaying the
command; `output_digest` is a fast pre-check.

A browser evidence item is the same shape with `kind: "browser"` and
additional `attachments` listing screenshot and DOM snapshot paths.

## Review verdict

A reviewer produces:

```json
{
  "schema": "cycle.review.v1",
  "id": "<uuid>",
  "candidate_id": "<uuid>",
  "reviewer_role": "functional_reviewer | security_reviewer",
  "verdict": "approve | reject | reject_with_repair",
  "findings": [
    {
      "id": "F1",
      "severity": "blocker | major | minor | nit",
      "file": "<path>",
      "line": <int|null>,
      "description": "<string>",
      "evidence_id": "<uuid|null>"
    }
  ],
  "summary": "<string>"
}
```

The two reviewers finalize independently. They do not see each other's
verdicts before submission. The arbiter reads both after they are sealed.

## Arbitration decision

The arbiter produces:

```json
{
  "schema": "cycle.arbitration.v1",
  "id": "<uuid>",
  "candidate_id": "<uuid>",
  "decision": "approved | repair | replan | blocked",
  "original_request_match": "satisfied | partial | unsatisfied",
  "evidence_sufficiency": "sufficient | insufficient",
  "reviewer_consensus": "agree | disagree | partial",
  "rationale": "<string>"
}
```

The arbiter never overrides a reviewer without naming the finding it is
overriding and the evidence supporting the override.

## Audit ledger format

Each line of `.cycle/audit.jsonl` is one JSON object:

```json
{
  "seq": <int>,
  "ts": <unix-millis>,
  "workflow_id": "<uuid>",
  "actor": {
    "kind": "agent | user | system",
    "role": "entry | architect | executor | functional_reviewer | security_reviewer | arbiter | user",
    "session_id": "<uuid>"
  },
  "event": "<see event kinds below>",
  "data": <object>,
  "prev_hash": "<hex>",
  "hash": "<hex>"
}
```

`hash` is `sha256` of the canonical JSON of the object without the `hash`
field. `prev_hash` is the previous line's `hash`. The first line has
`prev_hash: "0000…0000"`. Lines are line-delimited JSON, exactly one
object per line, no trailing commas, no embedded newlines.

### Event kinds

| Kind | Emitted by | `data` shape |
|---|---|---|
| `workflow_started` | entry | `{ request_digest, mode, project_key }` |
| `state_transition` | any | `{ from, to, reason, authorizing_actor }` |
| `plan_submitted` | architect | `{ plan_id, plan_digest, task_count }` |
| `plan_defect` | architect | `{ reason }` |
| `task_started` | executor | `{ task_key, write_scopes }` |
| `task_completed` | executor | `{ task_key, status, changed_paths, summary }` |
| `evidence_recorded` | verifier | `{ evidence_id, kind, status, command }` |
| `candidate_frozen` | control | `{ candidate_id, manifest_digest, file_count }` |
| `review_submitted` | reviewer | `{ review_id, role, verdict, finding_count }` |
| `arbitration_decided` | arbiter | `{ arbitration_id, decision }` |
| `candidate_promoted` | control | `{ candidate_id, changed_paths, revision }` |
| `repair_started` | control | `{ cycle, feedback_digest }` |
| `replan_started` | control | `{ previous_plan_digest }` |
| `workflow_paused` | user | `{ at_state }` |
| `workflow_resumed` | user | `{ at_state }` |
| `workflow_cancelled` | user | `{ at_state, reason }` |
| `workflow_completed` | control | `{ final_state }` |
| `amendment_recorded` | user | `{ text }` |
| `permission_decision` | user | `{ permission, decision, prompt_id }` |

## Memory layer

The memory layer is a directory of typed records under `.cycle/memory/`.
Each record is a JSON file with `kind`, `id`, `created_at`, `confidence`,
`source`, and `body`. The plugin supports `search`, `explain`, and
`remove` operations. See `memory/layer.md` for the kind registry and
retention rules.

## Graph layer

The graph layer is a directory `.cycle/graph/` containing:

- `index.sqlite` — the persistent AST index
- `cache/` — derived queries
- `manifest.json` — index version, language set, file count, last update

`scripts/graph-index.mjs` builds the index. `scripts/graph-query.mjs`
answers scoped queries. See `graph/indexer.md` and `graph/query.md`.

## Concurrency

A single project supports up to 100 concurrent workflows. The scheduler
queues work past the limit. The audit ledger is per-workflow. The graph
index is shared, read-locked during queries, write-locked during updates.
The memory layer is shared with a per-project namespace and a per-workflow
overlay.

A user may pin a project to single-workflow mode in
`~/.mavis/cycle/config.json` if cross-workflow state contamination is a
concern.
