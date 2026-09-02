# Native MiniMax setup and uninstall

Run this procedure only after the user explicitly asks to set up Cycle. Agent Plugin installation
alone creates no agents and changes no profile capability.

MiniMax Code `3.0.68.134` exposes native `agent`, `session`, and `mcp` management, but no native
`plugin`, `skill`, or hook-management group. Cycle therefore uses the supported surfaces that do
exist:

- the deterministic `cycle-skill-<version>.zip` archive is an integrity artifact, not a currently
  certified MiniMax installation channel: Desktop `3.0.68.134` opens a manual editor from
  **Plugins → Personal → Create → Input skill** and exposes no ZIP upload control;
- Agent Plugin distribution remains a public-Git-import candidate that requires its own exact
  live-install certification;
- local MCP setup: the coordinator registers `cycle-tools` through native `mavis mcp create` from
  the extracted canonical artifact;
- five custom agents: native `mavis agent` owns their identity and canonical `agent.md` files own
  their exact tool/MCP/Skill selectors.

Do not use a shell `mavis` CLI, undocumented HTTP endpoint, database edit, direct plugin-store edit,
or prompt-only tool restriction.

## Readiness states

- `installed_unverified`: MCP and five agents round-trip, every canonical capability profile is
  byte-exact, but fresh child-session tool ceilings have not been live-probed.
- `ready`: the installed state plus live per-role allow/deny roster and behavior probes passed on
  the current MiniMax build.
- `blocked`: a collision, missing native capability, profile mismatch, MCP failure, or live probe
  failure remains.
- `uninstalled`: Cycle-owned agents and MCP registration are absent. Durable Cycle data remains.

## 1. Preflight — no writes

1. The setup request must include an explicit, absolute `profile_root`: the user-confirmed active
   MiniMax data directory for this profile. It is neither the plugin root, a task workspace, nor
   `CYCLE_DATA_DIR`. A disposable certification run supplies its disposable data root. Do not guess
   or discover this directory through Terminal, a shell, directory traversal, or a profile-store
   workaround. Keep the absolute path out of receipts.
2. Show the sanitized current profile name and confirm it is the profile represented by
   `profile_root`. A missing, relative, or unconfirmed root stops setup before the first mutation.
3. Call `cycle_setup` with `operation: "spec"`. It returns the five exact agents, their complete
   canonical `agent.md` bytes and digests, each `profileRelativePath`, and the `cycle-tools` MCP
   specification.
4. Call native `mavis` with `agent help`, `agent list`, `mcp help`, and `mcp list`.
5. The live contracts must expose deterministic agent create/get/list/delete and MCP
   list/get/create/update/delete. A native Custom Agent `system_prompt` update is not a setup
   capability: its canonical `agent.md` is the prompt authority. Missing required operations stop
   setup.
6. For each expected agent, call `agent get`. Read its canonical `agent.md` when present and pass
   native fields plus `observed_agent_markdown` to `cycle_setup assess`.
7. Call `mcp get` for `cycle-tools` when it exists. A same-name server is Cycle-owned only when its
   description, transport, command and arguments match this version's specification.

If any agent or MCP collision is foreign, stop before the first mutation. Keep bounded preflight
snapshots for rollback, but never place raw prompts, absolute paths, credentials, private config, or
session transcripts in a receipt.

## 2. Register the local MCP when needed

Agent Plugin import may already have registered `cycle-tools`. No local ZIP upload flow is certified
on the observed Desktop build. A disposable live test may use a user-supplied extracted canonical
plugin root, but that proves only MCP registration, never Skill installation or distribution.
Resolve `dist/server.js` below that root and confirm it is a regular file inside the root.

Use native `mavis mcp create` with:

- name `cycle-tools`;
- transport `stdio`;
- command `node`;
- one argument: the resolved `dist/server.js`;
- description containing `cycle-managed:minimax-code-cycle-plugin` and this plugin version;
- enabled `true`.

Immediately call `mcp get`, then invoke `cycle_doctor` through the connected MCP. A configuration
row without a successful MiniMax-owned handshake is not installed. Update only a previously
Cycle-owned stale row; never take over a foreign same-name MCP server.

## 3. Create agents and install capability profiles

Use only arguments returned by current `agent help`. Native create establishes the exact name and
description. Before create, form the only permitted profile target by joining the confirmed
`profile_root` with that role's returned `profileRelativePath`. It must resolve to exactly
`agents/<managed-name>/agent.md` below `profile_root`; otherwise stop. Native create owns that
directory. Do not use Terminal, a shell, or directory discovery to find the target.

After the native agent exists, use the normal MiniMax `write` tool to replace only that exact target
with the complete returned `profile` bytes; do not merge or invent fields. This narrowly scoped
canonical-file write is the supported capability-profile installation step, not a profile-store
workaround. Canonical `agent.md` is the only authority for the Custom Agent system prompt and
capability selectors. The observed Mavis runtime derives the native `agent get` system prompt from
that file and rejects `mavis agent update` for `system_prompt`. Never call native `agent update`
with `system_prompt`, including after a profile write. Re-read the file and require its SHA-256 to
match `profileDigest`, then call `agent get` and require its returned system prompt to equal the
`systemPrompt` from `cycle_setup spec`. Do not hand-edit either returned value or use a shell to
derive a digest.

The canonical selectors are the security boundary enforced by MiniMax before every child Turn:

| Role | Exact tools | MCP servers | Skills |
|---|---|---|---|
| architect | `read`, `grep`, `glob` | none | none |
| executor | `read`, `write`, `edit`, `grep`, `glob` | none | none |
| functional reviewer | `read`, `grep`, `glob` | none | none |
| security reviewer | `read`, `grep`, `glob` | none | none |
| arbiter | `read`, `grep`, `glob` | none | none |

The allowlist excludes shell/Git, delegation, `mavis`, memory, browser mutation, every MCP tool, and
unknown future tools. Deterministic tests and proofs run in the parent through the Cycle evidence
engine; role sessions only inspect or propose scoped file edits. Post-task Git reconciliation still
rejects executor writes outside the current/completed task scopes.

After every native create or profile-file write, call `agent get`, re-read `agent.md`, and call
`cycle_setup assess`. The result must be `noop`. If `assess` returns `update` after the byte-exact
profile write and native read-back, stop setup as `blocked`: the canonical profile did not produce a
trusted native round-trip. Do not use native `agent update` with `system_prompt` as recovery. At the
end `agent list` contains each expected name exactly once.

Per-agent model YAML is not evidence. Record the inherited session model unless a native
write/read round-trip proves another model. See https://github.com/MiniMax-AI/minimax-code/issues/124.

## 4. Live capability probes

T04 can prove only canonical bytes. T07 starts a fresh native task session for every managed agent
and inspects the actual child tool roster before asking for behavior:

- every role must lack `task`, `task_append`, `mavis`, `memory`, all `mcp__*`, and an unknown probe;
- read-only roles expose exactly `read`, `grep`, and `glob` from the Cycle profile;
- executor exposes exactly `read`, `write`, `edit`, `grep`, and `glob` from the Cycle profile;
- a read succeeds for every role;
- a bounded executor write inside its assigned scope succeeds and is reconciled;
- read-only write requests fail because the tool is absent, not because the prompt declined;
- executor shell, Git, delegation, Cycle-control, and MCP requests fail because those tools are
  absent.

Tool text or a role claim is not evidence. Use the session event/tool records plus the resulting
filesystem state. Any extra tool, missing allowed tool, or selector drift keeps setup blocked.

## 5. Sanitized receipt

Produce one `cycle.mavis-setup-receipt.v2` object:

- exactly five role/name rows;
- `nativeVerified` only after native get/list agreement;
- effective model plus honest source;
- `configDigest` of the canonical `agent.md`;
- separate offline and live profile verification booleans;
- status derived from the readiness rules above.

Validate it with `cycle_setup validate_receipt`, then write it to the profile-local
`cycle/setup-receipt.json`. It contains no raw prompt, path, credential, private configuration,
session identifier, or raw tool output. A MiniMax, Skill, MCP, agent-profile, or artifact byte change
makes the live portion stale.

## 6. Rollback and explicit uninstall

Rollback changes only this run made:

1. Delete newly created agents only after `cycle_setup uninstall` authorizes each current native
   snapshot.
2. Restore prior Cycle-owned agent fields and canonical profile bytes for updated agents.
3. Delete a newly created `cycle-tools` row, or restore the prior Cycle-owned row.
4. Re-run agent and MCP get/list checks. Any incomplete rollback is `blocked`.

Explicit uninstall requires a separate user request. Delete only marker-owned agents and the
matching Cycle-owned MCP row, validate an `uninstalled` receipt, and preserve all durable Cycle data
unless the user separately requests its deletion.
