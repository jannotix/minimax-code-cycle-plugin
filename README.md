# minimax-code-cycle-plugin

Evidence-gated multi-role delivery for MiniMax Code. Adds a `Cycle` agent, five
isolated specialist agents, an AST knowledge graph, a hash-chained audit ledger,
plan mode integration, goal mode, and a managed browser QA path. No web UI, no
cloud account, no telemetry. Native to MiniMax Code only.

## Why use it

A single MiniMax Code session often interprets a request, implements it, and
approves the result with the same context. That structural pattern produces
incomplete deliveries: backend without UI, UI without tests, migrations that
were never run, security controls that work in one path and are bypassed in
another. This plugin separates those responsibilities and requires real
evidence before any candidate is approved.

The workflow coordinates five isolated sessions, each with its own prompt,
tools, and (optionally) its own model:

| Role | Purpose | Can edit? |
|---|---|---|
| `cycle-architect` | Requirement matrix, risk analysis, acyclic task plan | no |
| `cycle-executor` | Implements one bounded task at a time, captures evidence | yes |
| `cycle-functional-reviewer` | End-to-end completeness across all layers | no |
| `cycle-security-reviewer` | Security, trust boundaries, architecture integrity | no |
| `cycle-arbiter` | Final approval against the immutable original request | no |

The arbiter never sees only the architect's interpretation. It receives the
exact original user request, the frozen candidate manifest, raw verification
evidence, and both finalized independent reviews.

## Install

```text
# 1. install the skill
cp -R skill/ ~/.mavis/skills/cycle/

# 2. register the five role agents (one-time)
for f in agents/cycle-*.md; do
  mavis agent create --from "$f"
done

# 3. open a project, select the Cycle agent
/cycle setup
/cycle doctor
/cycle run auto
```

The `setup` command configures the per-role model assignments. Every
installation is model-agnostic: each user picks the model for each of the five
roles in their own environment. There is no required model, no required
provider, no required subscription.

The CLI tools under `scripts/` are optional. They provide ad-hoc verification
(`node scripts/verify-audit.mjs .cycle/audit.jsonl`), ad-hoc graph queries
(`node scripts/graph-query.mjs . declarations --kind class`), and production
packaging (`node scripts/package-skill.mjs . --version 1.0.0`).

## Uninstall

```text
# 1. remove the role agents
for name in cycle-architect cycle-executor cycle-functional-reviewer cycle-security-reviewer cycle-arbiter; do
  mavis agent delete --name "$name"
done

# 2. remove the skill
rm -rf ~/.mavis/skills/cycle/

# 3. remove the audit ledger and the project state (per project)
rm -rf .cycle/
```

Application updates never touch plugin state because all durable data lives
outside the MiniMax Code install directory. After uninstall the MiniMax Code
install is back to its pre-install state.

## Commands

| Command | Purpose |
|---|---|
| `/cycle setup` | First-run configuration and compatibility checks |
| `/cycle run [auto\|quick\|full]` | Arm the next request with a routing preference |
| `/cycle plan` | Architect only, read-only planning |
| `/cycle execute` | Executor only, bounded task |
| `/cycle review` | Run the two independent reviewers on a candidate |
| `/cycle arbitrate` | Arbiter only, on existing reviews |
| `/cycle status` | Current workflow state, mode, candidate, repair budget |
| `/cycle tasks` | Durable task identifiers and states |
| `/cycle evidence` | Recorded candidate gates |
| `/cycle:resume` | Resume a paused or interrupted workflow |
| `/cycle pause` | Pause at next safe boundary |
| `/cycle cancel --confirm` | Cancel authorized work |
| `/cycle retry` | Retry classified failure |
| `/cycle history` | Query project audit events |
| `/cycle history verify` | Verify the hash chain |
| `/cycle memory search\|explain\|remove` | Project memory operations |
| `/cycle models [role] [provider/model]` | Inspect or assign per-role model |
| `/cycle permissions` | Inspect role boundaries and active preset |
| `/cycle limits` | Inspect admission and repair limits |
| `/cycle export --confirm` | Export workflow state, ledger, or evidence |
| `/cycle doctor` | Read-only installation and project diagnostics |
| `/cycle help` | Command reference |

## Design principles

1. Preserve user intent. The immutable original request is the acceptance source.
2. Prove completion. Deterministic evidence outweighs agent narration.
3. Keep simple work simple. Use the smallest route and the least code.
4. Separate powers. Five isolated sessions with explicit information boundaries.
5. Stay locally controlled. State lives outside the MiniMax Code install.
6. Preserve accountability. Every action is auditable and verifiable.

## Compatibility

Targets MiniMax Code Desktop 1.18.16 and 1.18.18. macOS Desktop is untested
in this release. Application updates never touch plugin state because all
durable data lives outside the MiniMax Code install directory.

## License

Functional Source License, Version 1.1, MIT Future License (FSL-1.1-MIT).
Copyright 2026 Gianluca Iannotta. Becomes MIT on the second anniversary of
public release.
