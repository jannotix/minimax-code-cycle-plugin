# T07 alpha.8 live MiniMax Code certification

Verdict: **BLOCKED**

This receipt binds the live run to source `ccb30de574830606618810440905825af1d939b8` and is
historical evidence only. The alpha.9 remediation changes distributed Skill bytes, so this receipt
cannot certify alpha.9.

## Candidate and environment

- Canonical TGZ: `minimax-code-cycle-plugin-2.0.0-alpha.8.tgz`, 1,893,078 bytes, SHA-256
  `fc995e6d629c74c538388f546c08f902d5041a8111026f8bf202c9c6f7551775`.
- Deterministic Skill archive: `cycle-skill-2.0.0-alpha.8.zip`, 41,922 bytes, SHA-256
  `bf52f5e94c6a9d8c896e15810ea219ed3d1f15d20929abd8daf5f3ac36b9b366`.
- Host: Windows x64, MiniMax Code Desktop `3.0.68.134`, authenticated MiniMax-M3, disposable
  local runtime profile.

## Passed live evidence

- Native `mavis` exposed `agent`, `cron`, `session`, and `mcp`; its MCP surface supported
  `list`, `get`, `create`, `update`, and `delete`.
- `cycle-tools` registered as a stdio Node server from the canonical artifact. A full MiniMax
  restart was required before the dynamically namespaced `cycle_doctor` tool appeared in a fresh
  task catalog.
- A successful MiniMax-owned `cycle_doctor` call with an explicit project root returned `ok: true`,
  plugin version `2.0.0-alpha.8`, store schema `8`, and zero error-severity findings.
- The test-only `CYCLE_DATA_DIR` was contained in the disposable runtime; its SQLite database was
  created there and the default user Cycle data directory was absent.
- `cycle_setup spec` and native `mavis agent` created all five expected `cycle-v2-*` agents. Four
  role profiles round-tripped to `noop`: architect, executor, functional reviewer, and arbiter.

## Blocking findings

1. **T07-A8-B01 — no local Skill ZIP installation surface (high).** In the observed Desktop build,
   **Plugins → Personal → Create → Input skill** opens a manual Skill editor. It exposes no local
   ZIP upload control. The deterministic local ZIP is therefore not a certified MiniMax distribution
   channel.
2. **T07-A8-B02 — five-role setup did not converge (high).** The security-reviewer profile stayed
   `update` rather than `noop`. Native `mavis agent update` rejected the system-prompt update with
   a local-runtime HTTP `422` while the profile and prompt were inconsistent. The alpha.9 procedure
   corrects the required ordering: canonical `agent.md` bytes first, then native `system_prompt`.
3. **T07-A8-B03 — child capability and workflow matrix not run (high).** No uploaded Skill was
   available, complete setup was not ready, and the UI-automation recovery budget was exhausted.
   Fresh child rosters, allowed/denied behavior, quick/full cycles, recovery, concurrency, delivery,
   persistence, uninstall, and the 20-run battery remain unproved.

A manually-directed remediation task also attempted a prohibited `bash` tool call; it was rejected
and made no change. It is recorded as a failed fallback attempt, not evidence of a compliant setup.

## Release decision

The candidate proved a real MiniMax MCP handshake, but did not prove a distributable Skill path or
a fully reconciled five-role profile. The only valid release decision is **BLOCKED**. See
`certification/t07-alpha8-live-certification.json` for the machine-readable receipt.
