---
name: cycle
description: Inspect the Cycle for MiniMax Code 2.0 development line and operate its durable workflow, exact candidate, evidence, review, arbitration, delivery, history, diagnostics, and resource-admission MCP tools. Use when the user explicitly mentions Cycle for MiniMax Code or asks to inspect its local control-plane state. Native five-role dispatch is not yet production-ready.
license: FSL-1.1-MIT
compatibility: Requires MiniMax Code with Agent Plugins 1.0 support and Node.js 22 or later on PATH. The 2.0 development line is not production-ready.
---

# Cycle for MiniMax Code

This is the entry point for the `2.0.0-alpha.3` development line. MiniMax Code loads this Skill and
the `cycle-tools` MCP server. It does not load the repository's legacy custom-agent files or create
a command namespace.

## Release boundary

The production rebuild is incomplete. Do not state or imply that the current alpha provides:

- an autonomous five-role workflow;
- isolated architect, executor, reviewers, or arbiter sessions;
- incremental AST code intelligence;
- setup, doctor, resume, Goal Mode, memory, or browser QA.

If a user asks to run a governed implementation cycle, explain that the control plane and native
Mavis-agent setup have not reached their production gate. Do not substitute a single-session
implementation and call it Cycle.

## T02 control-plane operations

All control-plane calls require an explicit absolute `project_root`. Never substitute the plugin
directory or its process working directory.

### Diagnose the control plane

Use `cycle_doctor` to inspect the project identity, durable SQLite store, schema version, history
chain, Ed25519 checkpoints, key permissions, configuration, and Node runtime. Warnings are not a
production pass; errors stop the workflow.

### Operate durable workflow state

Use `cycle_workflow` for `start`, `status`, `amend`, `submit_plan`, `report_task`,
`freeze_candidate`, `verify`, `evidence`, `submit_review`, `submit_browser_evidence`, `run_proof`,
`arbitrate`, `deliver`, `reconcile`, and `control`. Every transition is state-validated. Delivery
writes and commits only the approved bytes and recovery resumes the journaled delivery.

The coordinator must not synthesize role verdicts. Until T04/T05 creates and drives independent
Mavis sessions, use these operations for deterministic testing and inspection, not as proof that a
five-role production cycle ran.

### Inspect or sign history

Use `cycle_history` for project-scoped listing, global chain/checkpoint verification, or signing the
current head. A chain with entries but no checkpoint is unsigned, not authenticated.

### Govern resource admission

Use `cycle_limits` to inspect measured CPU, memory, and disk pressure or manage expiring workflow
leases. Unknown resource metrics defer admission rather than being assumed safe.

## Legacy diagnostic operations

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
