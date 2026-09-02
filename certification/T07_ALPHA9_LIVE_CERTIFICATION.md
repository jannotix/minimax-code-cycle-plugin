# T07 alpha.9 live MiniMax Code certification

Verdict: **BLOCKED**

This receipt binds the live run to source `47705c621b3d3c84a36d61d38c267486f8d05e97`. It is
historical evidence; a procedure correction requires a new version and fresh live certification.

## Candidate and environment

- Canonical TGZ: `minimax-code-cycle-plugin-2.0.0-alpha.9.tgz`, 1,893,559 bytes, SHA-256
  `3db26aac1fb4dbc2656acf81bbe563837413adace26dd28149be4c40c4807b17`.
- Deterministic Skill archive: `cycle-skill-2.0.0-alpha.9.zip`, 42,213 bytes, SHA-256
  `a3f01c1f96a5b886f36055ed610c6a7298db768e1ff1ab4a99069e03f9973df3`.
- Host: Windows x64, MiniMax Code Desktop `3.0.68.134`, authenticated MiniMax-M3, disposable
  local runtime profile.

## Passed live evidence

- The Personal Skills UI was directly inspected. **Input skill** opens only a manual editor with
  name, description, and instruction fields; there is no local ZIP upload control. No Skill was
  created.
- Native `mavis mcp` exposed management operations. `cycle-tools` was registered as a stdio Node
  server from the canonical artifact and then explicitly updated with exactly one test-only
  `CYCLE_DATA_DIR` entry.
- A full MiniMax restart exposed the dynamically namespaced `cycle_doctor` tool in a fresh task.
  Its MiniMax-owned call returned `ok: true`, version `2.0.0-alpha.9`, store schema `8`, and zero
  error-severity findings.
- The Cycle database was created only under the disposable runtime; the default user Cycle data
  directory remained absent. The real MiniMax profile retained no MCP row and no `cycle-v2-*` agent.
- Role preflight found all five names absent and the parent catalog contained `mavis`, `task`,
  `read`, `write`, `edit`, `grep`, and `glob`.
- The architect was created, its canonical `agent.md` was written byte-for-byte, and
  `cycle_setup assess` returned `noop` with matching profile and prompt digests.

## Blocking findings

1. **T07-A9-B01 — no local Skill archive installation surface (high).** The observed UI has no ZIP
   upload control. The deterministic archive cannot be represented as a current MiniMax distribution
   channel.
2. **T07-A9-B02 — mandatory native prompt update is incompatible with Custom Agents (high).** The
   alpha.9 procedure requires `mavis agent update` after writing the canonical profile. Native Mavis
   returned local-runtime HTTP `422`: a Custom Agent system prompt must be edited in canonical
   `agent.md`. The already-written canonical profile produced `cycle_setup assess: noop`, so the
   required update is both rejected and redundant. Alpha.10 must remove this impossible mutation and
   retain the file/profile assessment as the proof.
3. **T07-A9-B03 — remaining role and workflow matrix not run (high).** The setup stops at the first
   mandatory-step failure. Executor, both reviewers, arbiter, child roster/allow-deny behavior,
   quick/full workflows, recovery, concurrency, delivery, persistence, uninstall, and the 20-run
   battery remain unproved.

No shell, direct profile-store edit, undocumented HTTP endpoint, plugin/Skill creation, publication,
or fallback role execution was used. The three disposable test directories were moved to the Recycle
Bin after the run and are recoverable until emptied.

## Release decision

The alpha.9 MCP integration works live, but the release is not distributable and its five-role setup
procedure is not executable as written. The only valid decision is **BLOCKED**. See
`certification/t07-alpha9-live-certification.json` for the machine-readable receipt.
