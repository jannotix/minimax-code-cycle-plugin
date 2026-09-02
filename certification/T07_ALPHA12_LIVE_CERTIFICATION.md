# T07 alpha.12 live MiniMax Code certification

Verdict: **BLOCKED**

This receipt binds the live run to source `c282264f191365e2c755a585f01b514b1cad2852`. It is
historical evidence. Any procedure or packaged-byte correction requires a new version and a fresh
live certification.

## Candidate and environment

- Canonical TGZ: `minimax-code-cycle-plugin-2.0.0-alpha.12.tgz`, 1,897,358 bytes, SHA-256
  `2cfd63a23df041fd5c5ff7fd2b9a657088ea4fe9bf40ce52b23a26064728a71d`.
- Deterministic Skill archive: `cycle-skill-2.0.0-alpha.12.zip`, 43,391 bytes, SHA-256
  `a82ea6cc23bc36fdc32d607c9206dd8826de6d19330690c60d9d115e5a872aea`.
- Host: Windows x64, MiniMax Code Desktop `3.0.68.134`, authenticated MiniMax-M3, disposable
  local runtime profile.

## Passed live evidence

- The Personal Skills creation menu was directly inspected. It offers manual input, conversation
  build, and public-Git import; it exposes no local ZIP upload. No Skill was created.
- Native `mavis mcp create/get` persisted exactly the supported `cycle-tools` identity: name, stdio
  type, enabled state, Node command, artifact server argument, and the managed owner argument. No
  unsupported description/environment metadata or native MCP update was used.
- After a full application restart, a fresh MiniMax task exposed the namespaced `cycle_doctor` tool.
  Its MiniMax-owned call returned `ok: true`, version `2.0.0-alpha.12`, schema `8`, zero
  error-severity findings, and `dataDirectorySource: "minimax_data_dir"`. Direct inspection found
  the database only below the disposable profile; the real default Cycle directory remained absent.
- All five managed agents were created from native Mavis identities and byte-exact canonical
  `agent.md` profiles. Native get/list plus `cycle_setup assess` ended at `noop` for every role;
  no Terminal, shell, HTTP, or native `agent update` was used in the accepted setup path.
- Native child-task/session evidence proved live rosters: architect, functional reviewer, security
  reviewer, and arbiter each exposed exactly `glob`, `grep`, `read`; executor exposed exactly
  `edit`, `glob`, `grep`, `read`, `write`. The child tasks reported no file changes or tool calls.

## Blocking findings

1. **T07-A12-B01 — no local Skill archive installation surface (high).** The observed UI has no ZIP
   upload control. The deterministic archive cannot be represented as a current MiniMax distribution
   channel.
2. **T07-A12-B02 — public Git-import channel not authorized or live-certified (high).** It is the
   remaining Agent Plugin distribution candidate, but publication/import was outside owner authority.
3. **T07-A12-B03 — workflow and behavior matrix incomplete (high).** Quick/full workflows,
   recovery, provider failure, concurrent projects, delivery, persistence, uninstall, and the
   20-run battery remain unproved. A bounded executor behavior probe is explicitly invalid: its
   parent used Terminal to inspect the child workspace, so it does not count as an allowed-write pass.

No Personal Skill, Git import, publication, undocumented HTTP call, or native `agent update` was
used. The disposable profile and artifacts were moved to the Recycle Bin after the run; the real
profile retained no MCP row, no `cycle-v2-*` agent, and no Cycle data directory. The separate fresh
Personal Skills UI-inspection profile was also moved to the Recycle Bin without creating a Skill.

## Release decision

Alpha.12 proves the supported native MCP, profile-scoped data, role setup, and live roster seams.
Distribution and the full behavioral release matrix remain blocked. The only valid decision is
**BLOCKED**. See `certification/t07-alpha12-live-certification.json` for the machine-readable receipt.
