---
name: cycle
description: Evidence-gated multi-role delivery. Coordinates an architect, an executor, two independent reviewers, and an independent final arbiter. No self-approval, real verification, hash-chained audit.
when_to_use:
  - User expresses implementation intent and the change is non-trivial
  - User wants planning without implementation
  - User wants to invoke a single specialist role on demand
  - A paused workflow needs to be resumed
do_not_use_for:
  - One-line typo fixes
  - Pure reading or explanation
  - Pure conversation about a code area
---

# Cycle

Cycle is the evidence-gated delivery workflow for MiniMax Code. It separates
the responsibilities that a single session cannot separate: interpretation,
implementation, end-to-end review, security review, and final approval. Each
of those runs in its own isolated session with its own prompt, its own tools,
and (optionally) its own model.

This file is the entry point. Everything else in `skill/` is reference
material that the workflow reads as needed.

## Operating principles

1. Preserve user intent. The exact original request is the only acceptance
   source. The arbiter does not judge the architect's interpretation, it
   judges the user's request.
2. Prove completion. A workflow terminates `approved` only when deterministic
   evidence is attached to a frozen candidate. Narration is not evidence.
3. Keep simple work simple. A `quick` route exists for low-risk narrow changes.
4. Separate powers. Five sessions, five prompts, five model configurations.
   No role approves its own work. No role sees the other's review before
   finalizing.
5. Stay locally controlled. All state lives in `.cycle/` (project) or
   `~/.mavis/cycle/` (user). Application updates never touch plugin state.
6. Preserve accountability. Every action is recorded in a hash-chained
   JSONL audit ledger. Anyone with read access can verify the chain.

## When to start a workflow

The Cycle entry agent (the user-facing one) must distinguish three cases:

| Case | User signal | Response |
|---|---|---|
| Discussion | "explain", "how does", "what if", "should we" | Read-only answer, no workflow start |
| Plan only | "plan a SaaS", "design the API for", "let's think about" | `/cycle plan` — Architect only |
| Implement | "implement", "build", "fix", "change", "add", "refactor" | `/cycle run [auto\|quick\|full]` |

`auto` selects the route from deterministic risk signals defined in
`routing/risk-signals.md`. `quick` is the bounded, reduced-governance path.
`full` runs every gate. `/cycle run` without a mode argument is `auto`.

## Commands

Run any of these through the native MiniMax Code command surface, with the
skill's `cycle` command registered. Each command is documented under
`docs/COMMANDS.md` and is a single source of truth for behavior, preconditions,
and automatic equivalents.

| Command | Mode | Default? |
|---|---|---|
| `/cycle setup` | configuration | first run only |
| `/cycle doctor` | diagnostic | optional |
| `/cycle plan` | read-only | on demand |
| `/cycle execute` | bounded | on demand |
| `/cycle review` | reviewer-only | on demand |
| `/cycle arbitrate` | arbiter-only | on demand |
| `/cycle run [auto\|quick\|full]` | full workflow | on user intent |
| `/cycle:resume` | resume | on pause or restart |
| `/cycle status` | inspect | on demand |
| `/cycle tasks` | inspect | on demand |
| `/cycle evidence` | inspect | on demand |
| `/cycle pause` | control | on demand |
| `/cycle cancel --confirm` | destructive | on demand |
| `/cycle retry` | recovery | on failure |
| `/cycle history [verify]` | inspect | on demand |
| `/cycle memory search\|explain\|remove` | memory | on demand |
| `/cycle models [role] [provider/model]` | configure | on demand |
| `/cycle permissions` | inspect | on demand |
| `/cycle limits` | inspect | on demand |
| `/cycle export --confirm` | destructive | on demand |
| `/cycle help` | reference | always available |

## Workflow lifecycle

```
intake -> architecture -> execution -> verification -> independent_reviews -> arbitration -> delivery
                                  \-> repair (max 5) <-/
                                  \-> replan   <-/
```

Each transition writes an event to the audit ledger. State transitions that
require approval (`repair` returning to `execution` and `arbitration` approving
to `delivery`) include the artifact that authorized the transition. There is
no implicit trust in any agent's self-report.

## Per-role model configuration

The five role agents (`cycle-architect`, `cycle-executor`,
`cycle-functional-reviewer`, `cycle-security-reviewer`, `cycle-arbiter`) each
read their own model from their own Mavis agent configuration. The Cycle
entry agent does not pass a model override to the role; it dispatches with
whatever model the role agent was configured with. The user configures models
once during `setup` and changes them later with `/cycle models`.

The plugin is fully model-agnostic. No model is required, no provider is
required, no subscription is bundled. The five role files in `agents/` are
shipped with the model field left to the installer's choice.

## Memory and graph

The workflow maintains two persistent stores outside the MiniMax Code
install:

- `.cycle/memory/` — cross-session project memory. Searchable, with
  provenance and confidence. See `memory/layer.md`.
- `.cycle/graph/` — local AST knowledge graph of the project. Deterministic,
  no vector store, scoped queries only. See `graph/indexer.md`.

Both stores are opt-in by file. They are never created in a project unless
the user runs `/cycle setup` for that project.

## Audit ledger

Every workflow action writes one line to `.cycle/audit.jsonl` with the
preceding line's hash. `scripts/verify-audit.mjs` re-computes the chain and
exits non-zero on any break. The chain is signed at the workflow boundary so
that a partial chain can be detected after a crash. The ledger format is
defined in `docs/PROTOCOL.md`.

## Browser QA

For changes that touch user-visible behavior, the executor opens a managed
browser session, performs the change, captures a screenshot and a DOM
snapshot, closes the session, and attaches both as evidence. The reviewers
read the artifacts. They never drive the browser themselves. See
`browser/qa-protocol.md`.

## Boundaries

The Cycle skill does not modify the MiniMax Code install. It does not read
or write the host's `opencode.json` (Mavis equivalent), provider credentials,
or session logs. It does not perform network calls outside the user's
explicit approval (browser QA is the only path that may contact a URL,
and the user confirms the origin first). It does not collect telemetry.

## Failure and recovery

A workflow that fails a verification gate is repaired by the executor with
the failing evidence as feedback. A workflow that fails an arbitration gate
is either repaired or replanned. After five repair cycles the workflow is
`blocked`. The user can `/cycle retry` after addressing the underlying cause,
or `/cycle cancel` to discard.

A workflow that crashes mid-run leaves the audit chain intact up to the last
recorded event. `/cycle:resume` starts a new workflow from the last
recorded state, re-admitting the same evidence where possible.

## Limits

- Maximum concurrent workflows per project: 100
- Maximum repair cycles per workflow: 5
- Maximum file size ingested by the graph indexer: 4 MiB
- Maximum candidate manifest size: 16 MiB
- Maximum number of role agents: 5 (fixed)

The defaults are tunable in `~/.mavis/cycle/config.json` but the maximum
concurrent workflows is a hard ceiling enforced by the scheduler.

## Reading order

For a new user, the recommended reading order is:

1. `docs/USER_MANUAL.md` — what the user does
2. `skill/PROTOCOL.md` — what the workflow does
3. `skill/roles/architect.md` — how the architect thinks
4. `skill/roles/executor.md` — how the executor works
5. `skill/roles/functional-reviewer.md`, `skill/roles/security-reviewer.md`
6. `skill/roles/arbiter.md` — how final approval works
7. `docs/ARCHITECTURE.md` — how the components fit together
8. `docs/THREAT_MODEL.md` — what this plugin does and does not protect against
