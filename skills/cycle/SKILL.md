---
name: cycle
description: Inspect the Cycle for MiniMax Code 2.0 development line and use its four local MCP utilities for audit-chain consistency, legacy candidate diagnostics, or lightweight structural indexing. Use when the user explicitly mentions Cycle for MiniMax Code, asks to verify a Cycle ledger, requests a diagnostic candidate manifest, or asks to build or query the current lightweight index. Do not claim that the alpha runs a governed five-role delivery workflow.
license: FSL-1.1-MIT
compatibility: Requires MiniMax Code with Agent Plugins 1.0 support and Node.js 22 or later on PATH. The 2.0 development line is not production-ready.
---

# Cycle for MiniMax Code

This is the entry point for the `2.0.0-alpha.1` development line. MiniMax Code loads this Skill and
the `cycle-tools` MCP server. It does not load the repository's legacy custom-agent files or create
a command namespace.

## Release boundary

The production rebuild is incomplete. Do not state or imply that the current alpha provides:

- an autonomous five-role workflow;
- isolated architect, executor, reviewers, or arbiter sessions;
- evidence-bound approval or delivery;
- signed history checkpoints;
- incremental AST code intelligence;
- setup, doctor, resume, Goal Mode, memory, or browser QA.

If a user asks to run a governed implementation cycle, explain that the control plane and native
Mavis-agent setup have not reached their production gate. Do not substitute a single-session
implementation and call it Cycle.

## Available MCP operations

### Verify a legacy audit chain

Use `cycle_verify_audit` with the ledger path. Report only that the JSONL sequence, previous-hash
links, and entry hashes are internally consistent or where they break. Internal consistency is not
origin authentication: the current verifier has no signed checkpoint.

### Produce a diagnostic candidate manifest

Use `cycle_freeze_candidate` only when the user explicitly requests a diagnostic manifest. State
that it compares `base_revision..HEAD` and is not an immutable production freeze. It must never be
used as evidence for approval or delivery.

### Build the lightweight structural index

Use `cycle_graph_index` with an explicit project root. The operation writes
`.cycle/graph/manifest.json` in that project. It performs a full rebuild and uses regular
expressions, not Tree-sitter.

### Query the lightweight index

Use `cycle_graph_query` with one of these implemented query kinds:

- `declarations`
- `signature` (the stored declaration record, not a typed source signature)
- `imports`
- `importers`
- `dependents` (currently equivalent to importers)
- `types` (heuristic references found on import lines)

Callers, callees, path traversal, time-based filtering, tags, and index-version scoping are not
implemented. Do not emulate missing graph facts or return an empty result as proof that no
relationship exists.

## Safety

- Use an explicit project root and show it to the user before an operation that writes `.cycle/`.
- Do not pass an output directory outside the project for the diagnostic manifest.
- Do not treat a tool exit code as evidence for behavior the tool does not implement.
- Do not create agents, hooks, or persistent profile configuration until the user explicitly asks
  to set up Cycle and the production setup task has been delivered.
- Keep credentials, private configuration, raw prompts, and absolute user paths out of reports.

## Source of truth

Read `../../PRODUCTION_RELEASE_PLAN.md` for the task sequence and release gates. The
legacy `PROTOCOL.md` and role documents are design inputs only until their production tasks replace
them.
