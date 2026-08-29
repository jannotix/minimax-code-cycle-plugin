# Cycle for MiniMax Code

> Development line: `2.0.0-alpha.3` — production release is blocked.

Cycle for MiniMax Code is being rebuilt as an evidence-gated delivery system that fits the public
MiniMax Code Agent Plugins 1.0 contract. The portable package may expose Skills and MCP servers; it
does not claim that MiniMax Code loads plugin-defined commands, agents, hooks, workflows, or UI.

The current alpha is a contract and migration checkpoint. It is not a production release and must
not be presented as a complete five-role autonomous cycle.

## Current, verified surface

MiniMax Code discovers one Skill at `skills/cycle/SKILL.md` and one dependency-free stdio MCP server
from `mcp.json`. The server currently exposes eight local tools:

| Tool | Current guarantee |
|---|---|
| `cycle_doctor` | Diagnoses project identity, Node, configuration, SQLite schema, history, checkpoints, and key permissions. |
| `cycle_workflow` | Drives durable planning, scoped task reconciliation, exact candidate freeze, verification, reviews, arbitration, delivery, and recovery. |
| `cycle_history` | Lists project-scoped history, verifies the global append-only chain and checkpoints, and signs the current head with Ed25519. |
| `cycle_limits` | Reports measured resource pressure and manages fair, expiring workflow leases. |
| `cycle_verify_audit` | Checks internal SHA-256 chain consistency in an existing JSONL ledger. It does not authenticate the ledger's origin. |
| `cycle_freeze_candidate` | Produces a legacy diagnostic manifest. It is not an immutable production candidate and must not authorize delivery. |
| `cycle_graph_index` | Builds a lightweight, full-rebuild structural index using deterministic regular expressions. It is not an AST index. |
| `cycle_graph_query` | Queries declarations, basic declaration records, imports, importers, dependents, and heuristic type references. |

The MCP server requires Node.js 22 or later on `PATH`. It makes no network calls and has no runtime
package dependencies.

## Not available in this alpha

The following capabilities remain release blockers and are not advertised as working:

- five isolated MiniMax role agents;
- runtime tool-boundary hooks;
- incremental Tree-sitter code intelligence;
- project memory, Goal Mode, and resource admission;
- production packaging and live MiniMax Code certification.

The top-level `agents/`, ignored `docs/`, and ignored Markdown scenarios are legacy design inputs.
MiniMax Code does not load them as Agent Plugin components.

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

Passing these checks proves the T02 control-plane, candidate, evidence, verdict, and delivery
foundation. It does not certify native Mavis role dispatch or MiniMax Code Desktop integration.

## Compatibility target

- Development and live certification target: MiniMax Code Desktop `3.0.68` on Windows.
- Node.js: 22 or later; development checks currently run on Node.js 26.
- macOS: `compatible but untested` until a separate native Desktop receipt exists.
- Linux: core Node checks may run in CI; MiniMax Code Desktop is not claimed on Linux.

## License

Functional Source License, Version 1.1, MIT Future License (`FSL-1.1-MIT`). The license text is
unchanged by the `2.0.0` production-readiness program.
