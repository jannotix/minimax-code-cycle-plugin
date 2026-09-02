# Cycle for MiniMax Code

> Development line: `2.0.0-alpha.10` — production release is blocked: T07 confirms the MCP
> handshake, but the setup procedure still needs an explicit shell-free profile-root handoff and
> MiniMax exposes no supported local Skill archive installation surface.

Cycle for MiniMax Code is being rebuilt as an evidence-gated delivery system that fits the public
MiniMax Code Agent Plugins 1.0 contract. The portable package may expose Skills and MCP servers; it
does not claim that MiniMax Code loads plugin-defined commands, agents, hooks, workflows, or UI.

The current alpha is a contract and migration checkpoint. It is not a production release and must
not be presented as a complete five-role autonomous cycle.

## Current, verified surface

The portable package declares one Skill at `skills/cycle/SKILL.md` and one dependency-free stdio MCP
server in `mcp.json`. The separately verified Skill ZIP is not a certified local installation path:
Desktop `3.0.68.134` exposes a manual Personal Skill editor rather than ZIP upload. A disposable
MCP registration can be live-tested independently, but it does not prove Skill discovery. The server
exposes twelve local tools:

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
- certified live capability-profile enforcement in the current MiniMax profile/build;
- fresh parent-mediated browser capture evidence for independent reviewer sessions;
- live MiniMax Code certification and publication authorization.

The top-level `agents/`, ignored `docs/`, and ignored Markdown scenarios are legacy design inputs.
MiniMax Code does not load them as Agent Plugin components.

## Native Mavis setup boundary

After a separate explicit user request, the Cycle Skill can install five user-owned `cycle-v2-*`
agents through MiniMax's native `mavis` tool. `cycle_setup` supplies byte-exact canonical
`agent.md` capability profiles and deterministic collision/ownership decisions; it performs no
profile write itself.
Setup is idempotent and uninstall deletes only marker-owned agents while preserving the durable
Cycle database.

For Custom Agents, canonical `agent.md` is the sole authority for both the system prompt and the
capability selectors. Setup writes and digests that exact file, then requires native `agent get` and
`cycle_setup assess` to round-trip to `noop`. It never calls native `agent update` with
`system_prompt`: the observed runtime rejects that mutation and treats `agent.md` as authoritative.

MiniMax Code `3.0.68` exposes agent management to model sessions through the native tool, not the
installed connector CLI. Setup therefore refuses CLI, undocumented HTTP, and direct database/file
scaffolding substitutes. It records the inherited session model unless a native agent-model
round-trip succeeds. [Upstream issue #124](https://github.com/MiniMax-AI/minimax-code/issues/124)
documents why per-agent YAML is not treated as evidence.

MiniMax `3.0.68.134` has no native hook-management group. Cycle instead uses MiniMax's canonical
custom-agent selectors: read-only roles allow only `read`, `grep`, and `glob`; the executor also
allows `write` and `edit`. `mcpServers: []` and `skills: []` keep governance and plugin tools out of
child sessions. The setup receipt remains `installed_unverified` until T07 inspects each live child
roster and exercises allowed/absent tools.

## Coordinator boundary

The T05 Skill captures the exact request, starts or reconciles one durable workflow, and executes one
`cycle_coordinator` action at a time. New roles are dispatched through MiniMax's native task tool;
malformed output resumes the same bound Mavis session. Every plan, task report, review, browser
capture, proof request, and arbitration is bound to the acting native session before the control
plane accepts it.

Reviewer sessions are distinct and blind to one another. The functional browser capture and
security proof flows may pause for evidence and then resume the originating session. Provider,
native-tool, setup, capability-profile, browser, or schema failure pauses/stops the workflow; the coordinator never
runs a missing role inline or reports a predicted transition as completed.

The coordinator deliberately uses the in-session native task/session tools. The current CLI does
not expose named multi-agent orchestration; [upstream issue
#135](https://github.com/MiniMax-AI/minimax-code/issues/135) records that boundary. CLI fan-out or a
single prompt pretending to contain five roles is not accepted as Cycle evidence.

## Target architecture

The production design uses only public MiniMax surfaces:

1. A natural-language Cycle Skill acts as coordinator. There is no command namespace.
2. A local MCP control plane owns state, evidence, candidates, history, gates, and delivery.
3. On an explicit setup request, the coordinator creates user-owned Mavis agents through the native
   tool and installs exact canonical capability profiles. Installation alone never creates agents.
4. Architect, executor, two reviewers, and arbiter run in separate Mavis sessions. The MCP control
   plane, not an agent narrative, decides whether a state transition is legal.
5. Missing setup, evidence, role separation, or runtime support fails closed.

See [PRODUCTION_RELEASE_PLAN.md](PRODUCTION_RELEASE_PLAN.md) for the task sequence, acceptance gates,
receipts, rollback rules, and publication boundary.

## Distribution boundary

The license remains FSL-1.1-MIT by owner decision. The official MiniMax community registry currently
requests an open-source license, so registry acceptance is an external blocked gate unless its
maintainers explicitly accept this license. Public Git import is the only candidate Agent Plugin
channel; a local directory or ZIP channel needs separate supported-UI evidence. No channel is
authorized for publication yet.

The legacy `v1.0.0`–`v1.1.2` archives are not production artifacts and their custom packager remains
disabled. T06 builds one canonical `minimax-code-cycle-plugin-<version>.tgz` with standard
`npm pack`. A strict allowlist creates a runtime-only package; SHA-256, file manifest, and provenance
sidecars bind the result. The gate then uses the host's independent `tar` implementation to list and
extract it in a second clean directory, verifies every file digest, and starts the extracted MCP
server for `initialize` and `tools/list` probes.

`git archive` builds `cycle-skill-<version>.zip` from the same committed Skill tree for deterministic
integrity checking. It must not be advertised as a current local installation channel: live Desktop
`3.0.68.134` offers a manual Personal Skill editor and no ZIP upload control. Public Git import is
the only candidate Agent Plugin channel, remains unauthorized for publication, and still requires an
exact live-import certification.

## Development checks

```sh
npm ci --ignore-scripts
npm run check
npm audit --omit=dev
```

`npm run check` runs typecheck, build, the requirement-mapped behavioral suite, SBOM and license
inventory freshness, artifact secret scanning, canonical packaging, and independent extraction and
MCP startup verification. Generated artifacts and sidecars are written under ignored `release/`.
`npm run package:release` additionally refuses a dirty Git worktree.

Passing these checks proves the T06 core and supply-chain contract on the executing host. It does not
certify live Mavis role dispatch, capability-profile enforcement, another operating system, or MiniMax Code Desktop
integration.

## Compatibility target

- Development and live certification target: MiniMax Code Desktop `3.0.68` on Windows.
- Node.js: 22 or later; development checks currently run on Node.js 26.
- macOS: `compatible but untested` until a separate native Desktop receipt exists.
- Linux: core Node checks may run in CI; MiniMax Code Desktop is not claimed on Linux.

## License

Functional Source License, Version 1.1, MIT Future License (`FSL-1.1-MIT`). The license text is
unchanged by the `2.0.0` production-readiness program.
