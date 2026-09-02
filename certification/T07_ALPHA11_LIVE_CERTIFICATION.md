# T07 alpha.11 live MiniMax Code certification

Verdict: **BLOCKED**

This receipt binds the live run to source `b657fc79b29d6b4784f7e9fcc5524b93a5a467d9`. It is
historical evidence. Any procedure or packaged-byte correction requires a new version and a fresh
live certification.

## Candidate and environment

- Canonical TGZ: `minimax-code-cycle-plugin-2.0.0-alpha.11.tgz`, 1,896,364 bytes, SHA-256
  `e13939c3c3b01d0ad8e4b48731f028d0b4f9a4a264864df486ad72377e47eadb`.
- Deterministic Skill archive: `cycle-skill-2.0.0-alpha.11.zip`, 42,914 bytes, SHA-256
  `4b92b7967eeffde71a3d263d1a6c45fa6d8d8f8d3e7d9719280491ed1a55ee58`.
- Host: Windows x64, MiniMax Code Desktop `3.0.68.134`, authenticated MiniMax-M3, disposable
  local runtime profile.

## Passed live evidence

- The Personal Skills UI was directly inspected. Its creation menu offers **Input skill**,
  conversation build, and public-Git import; no local ZIP upload exists. No Skill was created.
- Native `mavis mcp create` registered `cycle-tools`; after a full restart a fresh MiniMax task
  exposed the dynamically namespaced `cycle_doctor` tool. Its MiniMax-owned call returned
  `ok: true`, version `2.0.0-alpha.11`, schema `8`, and zero error-severity findings.
- With the explicit disposable `profile_root` and each returned `profileRelativePath`, all five
  native Cycle agents were created. Each normal-MiniMax `write`/`read` round-trip was byte-exact;
  native `agent get` and `cycle_setup assess` returned `noop` for architect, executor, functional
  reviewer, security reviewer, and arbiter. No Terminal, shell, HTTP, or native `agent update` was
  used.

## Blocking findings

1. **T07-A11-B01 — no local Skill archive installation surface (high).** The observed UI has no ZIP
   upload control. The deterministic archive cannot be represented as a current MiniMax distribution
   channel.
2. **T07-A11-B02 — Mavis discards configured stdio metadata and environment (high).** Native
   `mcp create` and a subsequent top-level `mcp update` both reported success, but direct inspection
   of the disposable profile proved that the persisted row contained only type, enabled, command,
   and arguments: its description and `CYCLE_DATA_DIR` were absent. The MCP therefore created a
   single `cycle.db` in the real default Cycle data location. The directory had been absent before
   the test; it was immediately moved to the Recycle Bin and the real profile was rechecked clean.
   Alpha.12 must remove unsupported metadata/environment assumptions and prove isolation through a
   supported host contract.
3. **T07-A11-B03 — child-role and workflow matrix not run (high).** The five profile files and
   native prompt round-trips pass, but live child tool rosters, allowed/absent behavior, workflows,
   recovery, concurrency, delivery, persistence, uninstall, and the 20-run battery remain unproved.

No Personal Skill, Git import, publication, undocumented HTTP call, Terminal/shell fallback, or
native `agent update` was used. The disposable runtime and the one test-created real default database
directory were moved to the Recycle Bin; the real profile retained no MCP row, no `cycle-v2-*` agent,
and no Cycle data directory.

## Release decision

Alpha.11 proves the complete shell-free five-role `agent.md` setup, but not a safe, exact local MCP
configuration on MiniMax `3.0.68.134`. It is not a distributable or production-ready candidate. The
only valid decision is **BLOCKED**. See
`certification/t07-alpha11-live-certification.json` for the machine-readable receipt.
