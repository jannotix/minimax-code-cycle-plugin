# T07 live MiniMax Code certification

Verdict: **BLOCKED**

Candidate source: `edb2e7e12f11c4a21de09bb6d588aa666dd24d58`

Canonical artifact: `minimax-code-cycle-plugin-2.0.0-alpha.7.tgz`, 1,894,939 bytes,
SHA-256 `681f4b1133189f4cc12bf567e5a6271db84ca1b383cea6cf4b1db702ba706dcd`.

Environment: Windows x64, MiniMax Code Desktop `3.0.68.134`, authenticated MiniMax-M3 session,
disposable runtime profile.

## Activation gate

The live `mavis` tool rejected `plugin help` with a validation error. Its advertised help groups are
only `agent`, `cron`, `session`, and `mcp`; the installed build exposes neither plugin installation
nor Skill inspection through the native model tool. The marketplace UI accepts public Git repository
imports, not the exact local artifact, and publication/push is outside T07 authority.

The same live help showed that `agent create` and `agent update` expose no hook or tool-policy field.
Creating five agents would therefore not demonstrate the required agent-scoped `PreToolUse` guards.

These are activation failures, not missing test narration. No shell, connector CLI, HTTP endpoint,
direct profile/database edit, marketplace import, Git push, or inline role fallback was used.

## Stop decision

The activation gate precedes Skill discovery, MiniMax-owned MCP handshake, five-role setup, role
isolation, quick/full cycles, recovery, restart, concurrency, delivery, and the 20-run battery. Those
checks were not run because their prerequisite did not exist. A standalone MCP process handshake
from T06 does not substitute for MiniMax plugin activation.

The disposable profile contained no installed Cycle plugin, agent, or Skill after the attempt. The
real profile remained unchanged. The owned MiniMax processes were stopped and every T07 temporary
directory was moved to trash; those temporary files are recoverable from the Recycle Bin until it is
emptied.

The machine-readable receipt is `certification/t07-live-certification.json`.
