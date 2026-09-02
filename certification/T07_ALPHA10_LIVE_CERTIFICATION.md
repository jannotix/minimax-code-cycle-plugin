# T07 alpha.10 live MiniMax Code certification

Verdict: **BLOCKED**

This receipt binds the live run to source `c66cc5f338bfc880ff8aae22dbcdefc2e4c80353`. It is
historical evidence. Any procedure or packaged-byte correction requires a new version and a fresh
live certification.

## Candidate and environment

- Canonical TGZ: `minimax-code-cycle-plugin-2.0.0-alpha.10.tgz`, 1,894,751 bytes, SHA-256
  `daea731af2d026a8658977fa3edeccbe114cc2ff187aab1d6b342de94385d7dc`.
- Deterministic Skill archive: `cycle-skill-2.0.0-alpha.10.zip`, 42,424 bytes, SHA-256
  `3525ba8706542b27fa507f942ed2d1f8c572cf0e32c113132fc89c16c39506e1`.
- Host: Windows x64, MiniMax Code Desktop `3.0.68.134`, authenticated MiniMax-M3, disposable
  local runtime profile.

## Passed live evidence

- The Personal Skills UI was directly inspected. **Input skill** opens only a manual editor with
  name, description, and instruction fields (limits 50/500/8000); it has no local ZIP upload
  control. No Skill was created.
- Native `mavis mcp` exposed list/get/create/update/delete. `cycle-tools` was registered from the
  exact artifact, then native update corrected a model-generated malformed update attempt. The final
  row had stdio Node transport, one server argument, exact managed description, enabled `true`, and
  only the test `CYCLE_DATA_DIR` key.
- After a full restart, a fresh MiniMax task exposed a dynamically namespaced `cycle_doctor` tool.
  Its MiniMax-owned call returned `ok: true`, version `2.0.0-alpha.10`, schema `8`, and zero
  error-severity findings. The resulting Cycle database existed only in the disposable test root.
- A bounded, non-certification diagnostic supplied the exact canonical `agent.md` path. With that
  path, the normal MiniMax `write` and `read` tools installed the 3,165-byte architect profile;
  native `agent get` plus `cycle_setup assess` returned `noop`. No native `agent update` occurred.

## Blocking findings

1. **T07-A10-B01 — no local Skill archive installation surface (high).** The observed UI has no ZIP
   upload control. The deterministic archive cannot be represented as a current MiniMax distribution
   channel.
2. **T07-A10-B02 — procedure lacks a shell-free canonical-profile-path handoff (high).** The first
   guided architect setup did not know the active profile root, attempted a Terminal directory
   listing, and initially left the native six-line `agent.md` stub. That forbidden fallback makes the
   run ineligible for certification. The later explicit-path diagnostic proves the alpha.10
   no-`agent update` repair works, but cannot cure the earlier non-compliant action. Alpha.11 must
   make the active profile root and per-agent relative target explicit before a fresh T07.
3. **T07-A10-B03 — remaining role and workflow matrix not run (high).** Executor, both reviewers,
   arbiter, child roster/allow-deny behavior, quick/full workflows, recovery, concurrency, delivery,
   persistence, uninstall, and the 20-run battery remain unproved.

No Personal Skill, Git import, publication, undocumented HTTP call, or native `agent update` was
used as acceptance evidence. The one read-only Terminal fallback is recorded as a failure, not as a
valid setup mechanism. The disposable profile and artifacts were moved to the Recycle Bin after the
run; the real profile retained no MCP row, no `cycle-v2-*` agent, and no Cycle data directory.

## Release decision

Alpha.10 proves the MCP handshake and the corrected Custom Agent prompt authority when a canonical
file target is explicit. It is not a distributable or production-ready candidate. The only valid
decision is **BLOCKED**. See `certification/t07-alpha10-live-certification.json` for the
machine-readable receipt.
