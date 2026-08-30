# Native Mavis setup and uninstall

This procedure is the only supported way to create Cycle role agents. It runs only after the user
explicitly asks to set up Cycle. Plugin installation alone must never call it or write outside the
plugin directory.

The setup uses the native MiniMax `mavis` model tool for agent operations and ordinary file tools
for agent-scoped hooks. Do not shell out to a `mavis` CLI, call an undocumented local HTTP endpoint,
or create agent database rows/directories by hand.

## Readiness states

- `installed_unverified`: all five native agents round-trip and guard files pass offline probes, but
  real-session hook dispatch has not been demonstrated on this MiniMax build.
- `ready`: the installed state plus live per-role hook probes passed in the current profile/build.
- `blocked`: a collision, missing native capability, failed round-trip, failed hook probe, or partial
  rollback remains.
- `uninstalled`: all Cycle-owned agents are absent. Durable Cycle control-plane data was untouched.

T04 can establish `installed_unverified`. Only the live T07 matrix may establish `ready`.

## 1. Preflight — no writes

1. Show the user the current MiniMax profile name and its resolved data directory. Certification
   uses the separately authorized disposable profile; never silently use the default profile.
2. Call `cycle_setup` with `operation: "spec"`. This returns the five exact names, descriptions,
   ownership markers, managed prompts, prompt digests, and guard digest for this plugin version.
3. Call the native tool with `mavis({ command: "agent help", args: {} })`, then
   `mavis({ command: "agent list", args: { include_primary: true, limit: 100, offset: 0 } })`.
   The help result must expose deterministic create/update/get/delete operations. If it does not,
   stop before changing anything.
4. For each expected name, call `mavis({ command: "agent get", args: { agent_name: name } })`.
   A missing agent is an absent observation. For an existing agent, send the returned name,
   description, and system prompt to `cycle_setup` `operation: "assess"`.
5. If any assessment is `conflict`, stop before the first mutation. Cycle never takes over an
   unmarked user agent merely because its name matches. `create`, `update`, and `noop` may proceed.

Capture the preflight snapshots in memory for rollback. Do not put raw prompts, absolute paths,
credentials, or private profile configuration in the receipt.

## 2. Create or update through the native API

Use only argument names returned by the current `agent help`; the bundled MiniMax documentation has
changed between builds. The native call must be able to establish the exact managed name,
description, and system prompt returned by `cycle_setup spec`. If it cannot, stop as `blocked`
instead of guessing another schema or editing the agent store directly.

- For `create`, call native `agent create`, then `agent update` if the current API separates
  scaffolding from prompt configuration.
- For `update`, call native `agent update` only on an agent whose ownership marker was verified.
- For `noop`, make no native write.

After every mutation, call native `agent get` and reassess it with `cycle_setup`. The required result
is `noop`. At the end, `agent list` must contain each exact name once.

Do not write per-agent `model:` or `thinking:` YAML. On affected MiniMax builds those fields are
silently ignored and child sessions inherit the effective session model. Record the model returned
by the native session/agent surface when available; otherwise record `null` with
`modelSource: "session-inherited"`. A per-agent model may be recorded only after a native write/read
round-trip proves that this build honors it.

## 3. Install agent-scoped guards

For each managed agent, resolve its native agent directory under the current profile. Create its
`hooks/` directory only after native `agent get` succeeded.

1. Copy `guard.mjs` byte-for-byte to `hooks/cycle-guard.mjs`.
2. Render `pre-tool-use.md.template` to `hooks/cycle-pre-tool-use.md`, replacing
   `{{GUARD_PATH}}` with the absolute copied guard path and `{{ROLE}}` with the manifest role.
   Quote the path as the template does; use forward slashes on Windows.
3. Re-read both files. The copied guard SHA-256 must equal `cycle_setup spec.guard.digest`; the hook
   frontmatter must remain `PreToolUse`, `script`, priority `10`, timeout `10000`.
4. From the setup coordinator session, run the copied guard directly with documented Mavis
   `{ "input": ..., "output": ... }` envelopes. Every read-only role must allow a read and return
   `_abort` for a write, shell, task, and unknown tool. The executor must allow a normal write and
   `git status`, and return `_abort` for delegation, `.git` access, `git add`, `git commit`,
   `git checkout`, and Cycle delivery/control calls.

An offline pass proves the script and file registration, not runtime dispatch. MiniMax Code issue
https://github.com/MiniMax-AI/minimax-code/issues/131 documents a build where Markdown hooks loaded
but normal V2 turns did not dispatch them. Keep `hookLiveVerified: false` until T07 triggers the
actual native tools in fresh role sessions and observes the expected allow/abort behavior.

The guard is defense in depth. Agent prompts remain layer one and post-task Git scope
reconciliation remains layer three; a missing hook never turns a role report into approval.

## 4. Sanitized receipt

Produce one object matching `receipt.schema.json`:

- exactly five roles and names;
- `nativeVerified: true` only after `agent get` and `agent list` agree;
- effective model plus its honest source;
- copied guard digest;
- separate offline and live hook booleans;
- status derived from the readiness states above.

Call `cycle_setup` with `operation: "validate_receipt"` and the completed object. Report it only
when the tool returns `valid: true`; otherwise setup is `blocked`.

The receipt contains no raw prompt, absolute profile/project path, API key, token, private config,
session transcript, or raw process output. A MiniMax/app/plugin byte change makes the live portion
stale.

## 5. Rollback after a failed setup

Rollback only changes made by this run:

1. Delete newly created agents with native `agent delete`, but only after `cycle_setup uninstall`
   returns `delete` for the current native snapshot.
2. Restore previously managed agents from their preflight name/description/prompt snapshots through
   native `agent update`.
3. Restore prior hook bytes for updated agents; remove hook files only when this run created them.
4. Re-run `agent get`, `agent list`, and offline hook checks. Any incomplete rollback is `blocked`.

Never delete the Cycle SQLite/data directory, project files, unrelated hooks, user agents, sessions,
provider configuration, or credentials.

## 6. Explicit uninstall

Uninstall requires a separate explicit user request.

1. Native `agent get` every expected name and call `cycle_setup` `operation: "uninstall"` with the
   observed fields.
2. If any result is `conflict`, stop before deletion. Missing agents are already `noop`.
3. Delete only results authorized as `delete`, using native `agent delete`.
4. Verify `agent get` reports every managed name absent and `agent list` contains none of them.
5. Return an `uninstalled` sanitized receipt. Preserve all durable Cycle data unless the user makes
   a separate, explicit data-deletion request.

## Host limitations recorded for MiniMax Code 3.0.68

- The installed `mcode-tools` CLI manages connectors, not native agents or sessions.
- Agent operations are native `mavis` tool calls; CLI/HTTP substitutes are unsupported here.
- Per-agent model configuration is not assumed. See
  https://github.com/MiniMax-AI/minimax-code/issues/124.
- Hook registration, offline execution, and live turn dispatch are three different facts. Only the
  last one clears the T07 runtime gate.
