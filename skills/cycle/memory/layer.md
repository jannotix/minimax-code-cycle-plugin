# Memory layer

The memory layer is a per-project, per-user persistent store of
reusable knowledge the workflow has learned about a codebase. It is
opt-in, written by the workflow, searchable and removable by the user,
and never read by the agent as an instruction.

A memory record is a JSON file under `.cycle/memory/<namespace>/<id>.json`
with the shape:

```json
{
  "schema": "cycle.memory.v1",
  "id": "<uuid>",
  "kind": "<see kind registry>",
  "namespace": "<project|user>",
  "created_at_unix_millis": <int>,
  "created_by": {
    "kind": "agent | user",
    "role": "<role or null>",
    "workflow_id": "<uuid or null>"
  },
  "confidence": "verified | inferred | user_asserted",
  "source": "<see source registry>",
  "provenance": {
    "files": ["<path>", ...],
    "commands": ["<command>", ...],
    "evidence_ids": ["<uuid>", ...]
  },
  "body": "<see per-kind body>",
  "ttl_unix_millis": <int | null>,
  "tags": ["<string>", ...]
}
```

## Kind registry

| Kind | Body shape | Purpose |
|---|---|---|
| `pattern` | `{ name, applies_to, description, example }` | A recurring code or test pattern the project uses |
| `anti_pattern` | `{ name, applies_to, description, why_bad }` | A pattern the project has rejected |
| `decision` | `{ statement, alternatives_considered, tradeoffs }` | A design decision the project made, with rationale |
| `convention` | `{ rule, scope, examples }` | A naming, layout, or style rule the project enforces |
| `gotcha` | `{ trigger, symptom, fix }` | A non-obvious failure mode and how to recognize and fix it |
| `glossary` | `{ term, definition }` | A project-specific term and its meaning |
| `external_fact` | `{ subject, fact, source_url, source_date }` | A fact about an external system the project depends on |

`pattern`, `anti_pattern`, `convention`, and `gotcha` are written by
the executor when the task reveals a previously-unrecorded project
convention. `decision` is written by the architect or the arbiter. A
`decision` is never written by the executor. `glossary` is written by
the architect. `external_fact` is written by the executor when the
project discovers a fact about an external system; the source URL must
be a stable reference (a docs page or an issue, not a transient page).

## Confidence

| Value | Meaning | How it changes |
|---|---|---|
| `verified` | The memory has been confirmed by a passing gate in a completed workflow | Stays `verified`; promoted from `inferred` by the reviewer or the arbiter |
| `inferred` | The memory was written by an agent and is plausible but not yet confirmed | Stays `inferred`; demoted to `removed` by the user or the arbiter |
| `user_asserted` | The memory was written by the user | Stays `user_asserted` until the user removes it |

A `verified` memory is durable. An `inferred` memory is a candidate.
A `user_asserted` memory is a directive. The workflow reads them in
that priority order.

## Operations

The user has three operations on the memory layer, all gated by
permission prompts for destructive actions:

- `/cycle memory search <query>` — search by free text, filtered by
  kind, namespace, confidence, and tags. Returns records with their
  `summary` and a link to the full record.
- `/cycle memory explain <memory-id>` — show the full record with its
  provenance, the workflow that wrote it, and the commands or files
  that supported it.
- `/cycle memory remove <memory-id> --confirm` — remove the record and
  the file. The removal is recorded in the audit ledger.

## Retention

A memory record may carry a `ttl_unix_millis`. After that time, the
record is moved to `.cycle/memory/_archive/`. It is no longer returned
by `/cycle memory search`. The user can restore from the archive by
copying the file back. The default TTL for an `inferred` memory is
90 days. The default for a `verified` or `user_asserted` memory is
none.

## Isolation

The memory layer is per-project and per-user. A project in user A's
home directory does not see a project in user B's. The user namespace
(`~/.mavis/cycle/memory/`) is shared across the user's projects. The
project namespace (`.cycle/memory/`) is per-project.

The workflow never reads memory as an instruction. The memory is a
lookup table for the role prompts; the role prompts decide what to
do with the lookup. A `user_asserted` memory is a hard constraint;
a `verified` memory is a strong default; an `inferred` memory is a
suggestion the role may ignore.
