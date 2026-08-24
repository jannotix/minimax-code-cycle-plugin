# Cycle for MiniMax Code

Evidence-gated multi-role delivery for MiniMax Code. A `Cycle` skill plus an
MCP server that exposes audit verification, candidate freeze, AST knowledge
graph, and scoped graph queries. No web UI, no cloud account, no telemetry.

## Why use it

A single MiniMax Code session often interprets a request, implements it, and
approves the result with the same context. That structural pattern produces
incomplete deliveries: backend without UI, UI without tests, migrations that
were never run, security controls that work in one path and are bypassed in
another.

Cycle separates the responsibilities of planning, implementation, end-to-end
review, security review, and final approval. The arbiter evaluates the
immutable original user request, not the architect's interpretation of it.
Every action is recorded in a hash-chained audit ledger. Real verification
commands produce the evidence the workflow advances on.

The plugin ships in two layers:

- **Marketplace layer** (Skill + MCP server): a portable Skill that the Agent
  follows, and an MCP server that exposes the evidence, freeze, and graph
  tools. This layer conforms to the MiniMax Code plugin contract and
  publishes to the official Plugin Marketplace.
- **Local full-fidelity layer** (5 custom Mavis agents + 6 CLI tools):
  the marketplace layer, plus five isolated Mavis agents (architect,
  executor, two reviewers, arbiter) and a set of Node CLI tools for ad-hoc
  verification, graph inspection, and production packaging. This layer
  gives structural session isolation between the five roles and is the
  recommended install for a personal MiniMax Code setup.

## Install from the Plugin Marketplace

The marketplace layer installs with one click from the Plugin Marketplace UI
inside MiniMax Code. Browse to "Cycle" and install. MiniMax Code reads
`plugin.json` and loads the Skill and the MCP server automatically. `node`
must be on the system PATH for the MCP server to start.

## Install locally (full 5-role architecture)

The local install mirrors what the marketplace installer does, plus the
optional 5-agent registration for structural session isolation.

```sh
# 1. drop the plugin into the Mavis plugins directory
#    (the marketplace layout is flat: plugin.json at the root)
PLUGIN_DIR=~/.mavis/plugins/cycle
mkdir -p "$PLUGIN_DIR"
cp plugin.json      "$PLUGIN_DIR/"
cp mcp.json         "$PLUGIN_DIR/"
cp -R skills/cycle/ "$PLUGIN_DIR/skills/"
cp -R mcp/           "$PLUGIN_DIR/mcp/"
cp -R scripts/       "$PLUGIN_DIR/scripts/"

# 2. also expose the Skill via the built-in skills location (Mavis reads both)
mkdir -p ~/.mavis/.builtin-skills/cycle
cp -R skills/cycle/* ~/.mavis/.builtin-skills/cycle/

# 3. register the five role agents (only for the full 5-role architecture)
for f in agents/cycle-*.md; do
  mavis agent create --from "$f"
done
```

Open a project in MiniMax Code, select the Cycle skill, and run:

```
/cycle setup
/cycle doctor
/cycle run auto
```

## Uninstall

```sh
# remove the local install
rm -rf ~/.mavis/plugins/cycle/
rm -rf ~/.mavis/.builtin-skills/cycle/
for name in cycle-architect cycle-executor cycle-functional-reviewer \
            cycle-security-reviewer cycle-arbiter; do
  mavis agent delete --name "$name"
done
rm -rf .cycle/

# uninstall from the marketplace UI: Settings -> Plugins -> Cycle -> Uninstall
```

Application updates never touch plugin state because all durable data lives
outside the MiniMax Code install directory. After uninstall the MiniMax Code
install is back to its pre-install state.

## What the plugin provides

### Skill (always loaded when installed)

The Cycle skill teaches the Agent the evidence-gated workflow. The Agent
follows the skill's plan, executes verification commands, freezes a
candidate, runs reviewers, and produces an arbitration decision. The
skill is the only entry point for the Agent.

### MCP server (always loaded when installed)

Four MCP tools, all under the `cycle-tools` server name:

| Tool | What it does |
|---|---|
| `cycle_verify_audit` | Verify a `.cycle/audit.jsonl` hash chain. Returns ok or fails with the broken line. |
| `cycle_freeze_candidate` | Produce a `cycle.candidate.v1` manifest from a worktree and a base revision. |
| `cycle_graph_index` | Build or update the local AST knowledge graph. |
| `cycle_graph_query` | Run a scoped query against the graph index (declarations, imports, dependents, types, signature, callers, callees, path). |

The server is a single Node script at `mcp/cycle-server.mjs` with no
external dependencies. It spawns the CLI tools as child processes and
forwards their output as MCP tool results.

### CLI tools (local install only)

Six Node scripts under `scripts/` for ad-hoc operations:

```sh
node scripts/verify-audit.mjs .cycle/audit.jsonl
node scripts/inspect-ledger.mjs tail .cycle/audit.jsonl --n 50
node scripts/inspect-ledger.mjs plan .cycle/audit.jsonl
node scripts/freeze-candidate.mjs . --base HEAD~1
node scripts/graph-index.mjs . --workers 8
node scripts/graph-query.mjs . declarations --name "*User*" --path "src/**"
```

### Custom agents (local install only)

Five Mavis custom agents with isolated prompts and per-role model
configuration. The full 5-role architecture gives structural session
isolation that the marketplace layer cannot provide.

## Design principles

1. Preserve user intent. The immutable original request is the acceptance source.
2. Prove completion. Deterministic evidence outweighs agent narration.
3. Keep simple work simple. Use the smallest route and the least code.
4. Separate powers. Five isolated sessions with explicit information boundaries.
5. Stay locally controlled. State lives outside the MiniMax Code install.
6. Preserve accountability. Every action is auditable and verifiable.

## Compatibility

Targets MiniMax Code Desktop 1.18.16 and 1.18.18. The MCP server requires
Node.js 20 or later on the system PATH. macOS Desktop is untested in this
release. Application updates never touch plugin state because all durable
data lives outside the MiniMax Code install directory.

## License

Functional Source License, Version 1.1, MIT Future License (FSL-1.1-MIT).
Copyright 2026 Gianluca Iannotta. Becomes MIT on the second anniversary of
public release.
