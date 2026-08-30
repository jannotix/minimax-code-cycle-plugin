# Cycle for MiniMax Code

> Development line: `2.0.0-alpha.6` — production release is blocked.

Cycle for MiniMax Code is being rebuilt as an evidence-gated delivery system that fits the public
MiniMax Code Agent Plugins 1.0 contract. The portable package may expose Skills and MCP servers; it
does not claim that MiniMax Code loads plugin-defined commands, agents, hooks, workflows, or UI.

The current alpha is a contract and migration checkpoint. It is not a production release and must
not be presented as a complete five-role autonomous cycle.

## Current, verified surface

MiniMax Code discovers one Skill at `skills/cycle/SKILL.md` and one dependency-free stdio MCP server
from `mcp.json`. The server currently exposes twelve local tools:

| Tool | Current guarantee |
|---|---|
| `cycle_doctor` | Diagnoses project identity, Node, configuration, SQLite schema, history, checkpoints, and key permissions. |
| `cycle_setup` | Returns the exact managed Mavis agent specification and plans create/update/noop/conflict or marker-safe uninstall; it never mutates a profile. |
| `cycle_coordinator` | Reads durable workflow/setup/capability facts and returns one legal dispatch, control-plane, resume, or stop action without mutating state. |
| `cycle_workflow` | Drives durable planning, scoped task reconciliation, exact candidate freeze, verification, reviews, arbitration, delivery, and recovery. |
| `cycle_history` | Lists project-scoped history, verifies the global append-only chain and checkpoints, and signs the current head with Ed25519. |
| `cycle_limits` | Reports measured resource pressure and manages fair, expiring workflow leases. |
| `cycle_verify_audit` | Checks internal SHA-256 chain consistency in an existing JSONL ledger. It does not authenticate the ledger's origin. |
| `cycle_freeze_candidate` | Produces a legacy diagnostic manifest. It is not an immutable production candidate and must not authorize delivery. |
| `cycle_graph_index` | Incrementally indexes supported source with bundled Tree-sitter WASM grammars; unchanged files are not read and unsafe links are skipped. |
| `cycle_graph_query` | Provides exact symbol lookup, confidence-tagged neighbours, impact traversal, bounded scope bundles, and graph status. |
| `cycle_memory` | Recalls compact project knowledge, explains evidence provenance, walks supersession chains, and explicitly revokes without deletion. |
| `cycle_goal` | Manages immutable objectives, versioned plans, workflow milestones, bounded continuations, pause/resume, and explicit completion approval. |

The MCP server requires Node.js 22 or later on `PATH`. It makes no network calls and has no runtime
package dependencies.

## Not available in this alpha

The following capabilities remain release blockers and are not advertised as working:

- live-certified five-role dispatch on the current MiniMax profile/build;
- certified live hook enforcement in the current MiniMax profile/build;
- automatic browser driving from independent reviewer sessions;
- production packaging and live MiniMax Code certification.

The top-level `agents/`, ignored `docs/`, and ignored Markdown scenarios are legacy design inputs.
MiniMax Code does not load them as Agent Plugin components.

## Native Mavis setup boundary

After a separate explicit user request, the Cycle Skill can install five user-owned `cycle-v2-*`
agents and agent-scoped guards through MiniMax's native `mavis` tool. `cycle_setup` supplies the
exact prompts and deterministic collision/ownership decisions; it performs no profile write itself.
Setup is idempotent and uninstall deletes only marker-owned agents while preserving the durable
Cycle database.

MiniMax Code `3.0.68` exposes agent management to model sessions through the native tool, not the
installed connector CLI. Setup therefore refuses CLI, undocumented HTTP, and direct database/file
scaffolding substitutes. It records the inherited session model unless a native agent-model
round-trip succeeds. [Upstream issue #124](https://github.com/MiniMax-AI/minimax-code/issues/124)
documents why per-agent YAML is not treated as evidence.

Registered and offline-tested hooks are not yet a runtime pass. [Upstream issue
#131](https://github.com/MiniMax-AI/minimax-code/issues/131) documents a recent V2 build where loaded
Markdown hooks were not dispatched by real turns. The setup receipt remains `installed_unverified`
until T07 exercises actual allowed and denied tools in fresh role sessions.

## Coordinator boundary

The T05 Skill captures the exact request, starts or reconciles one durable workflow, and executes one
`cycle_coordinator` action at a time. New roles are dispatched through MiniMax's native task tool;
malformed output resumes the same bound Mavis session. Every plan, task report, review, browser
capture, proof request, and arbitration is bound to the acting native session before the control
plane accepts it.

Reviewer sessions are distinct and blind to one another. The functional browser capture and
security proof flows may pause for evidence and then resume the originating session. Provider,
native-tool, setup, hook, browser, or schema failure pauses/stops the workflow; the coordinator never
runs a missing role inline or reports a predicted transition as completed.

The coordinator deliberately uses the in-session native task/session tools. The current CLI does
not expose named multi-agent orchestration; [upstream issue
#135](https://github.com/MiniMax-AI/minimax-code/issues/135) records that boundary. CLI fan-out or a
single prompt pretending to contain five roles is not accepted as Cycle evidence.

## Target architecture

The production design uses only public MiniMax surfaces:

1. A natural-language Cycle Skill acts as coordinator. There is no command namespace.
2. A local MCP control plane owns state, evidence, candidates, history, gates, and delivery.
3. On an explicit setup request, the coordinator creates user-owned Mavis agents and agent hooks
   through the native Mavis tools. Installation alone never creates persistent agents or hooks.
4. Architect, executor, two reviewers, and arbiter run in separate Mavis sessions. The MCP control
   plane, not an agent narrative, decides whether a state transition is legal.
5. Missing setup, evidence, role separation, or runtime support fails closed.

See [PRODUCTION_RELEASE_PLAN.md](PRODUCTION_RELEASE_PLAN.md) for the task sequence, acceptance gates,
receipts, rollback rules, and publication boundary.

## Distribution boundary

The license remains FSL-1.1-MIT by owner decision. The official MiniMax community registry currently
requests an open-source license, so registry acceptance is an external blocked gate unless its
maintainers explicitly accept this license. Until then, the only planned channels are a verified
GitHub release and a local directory install. Neither channel is authorized for publication yet.

The legacy `v1.0.0`–`v1.1.2` archives are not production artifacts. The legacy packager is disabled
and exits non-zero until the supply-chain task replaces it with a standard, independently verified
artifact pipeline.

## Development checks

```sh
npm test
npm run typecheck
npm run build
node --check dist/server.js
node --check scripts/verify-audit.mjs
node --check scripts/inspect-ledger.mjs
node --check scripts/freeze-candidate.mjs
node --check scripts/graph-index.mjs
node --check scripts/graph-query.mjs
node --check scripts/package-skill.mjs
```

Passing these checks proves the T05 coordinator contract, durable role-session separation, safe
native setup planner, offline agent guards, candidate delivery, incremental graph, durable memory,
Goal Mode, and measured admission foundation. It does not certify live Mavis role dispatch or
MiniMax Code Desktop integration.

## Compatibility target

- Development and live certification target: MiniMax Code Desktop `3.0.68` on Windows.
- Node.js: 22 or later; development checks currently run on Node.js 26.
- macOS: `compatible but untested` until a separate native Desktop receipt exists.
- Linux: core Node checks may run in CI; MiniMax Code Desktop is not claimed on Linux.

## License

Functional Source License, Version 1.1, MIT Future License (`FSL-1.1-MIT`). The license text is
unchanged by the `2.0.0` production-readiness program.
