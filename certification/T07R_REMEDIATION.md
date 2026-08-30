# T07R MiniMax-native remediation

Status: **IMPLEMENTED — LIVE RECERTIFICATION REQUIRED**

Baseline source: `ea8a94851ee3c6d5df559155be6f6381fb974fcb`

Target line: `2.0.0-alpha.8`

Host evidence: MiniMax Code Desktop `3.0.68.134`, Windows x64. The installed application source was
read from its packaged ASAR without modifying the application or either MiniMax profile.

## Root cause

The alpha.7 design required native plugin/Skill management and agent-scoped hooks. The live T07
receipt proved those management groups do not exist. Prompt rules cannot replace missing runtime
authorization.

## Code-gated replacement

The installed host has a stronger supported seam: canonical custom-agent `agent.md` selectors.
MiniMax parses exact `tools`, `disallowedTools`, `mcpServers`, and `skills` arrays, intersects them
with the ready turn inventory, then builds the child tool catalog. A tool omitted from `tools` is not
shown to or callable by the child; `mcpServers: []` excludes every configured MCP server. Task-child
delegation and `mavis` are also removed by the host.

Cycle now writes complete, ownership-marked canonical profiles:

- architect, functional reviewer, security reviewer, arbiter: `read`, `grep`, `glob`;
- executor: `read`, `write`, `edit`, `grep`, `glob`;
- every role: no MCP server and no Skill selector.

The executor no longer receives shell/Git or browser tools. Parent-owned evidence execution runs
tests and proofs. Parent-mediated browser capture is passed to the independent functional reviewer.
Fresh T07 child-roster and behavior probes remain mandatory before `ready`.

## Supported local installation

The installed UI supports local Skill upload from `.zip`, `.skill`, or `.md`, while full Agent
Plugin import requires a public Git repository. T07R therefore adds a standard `git archive` Skill
ZIP for the local pre-publication channel. Native `mavis mcp create` registers `cycle-tools` against
the extracted canonical TGZ. Post-publication Git import remains the complete Agent Plugin path.

## Installed-source evidence

| ASAR source | Bytes | SHA-256 | Proven fact |
|---|---:|---|---|
| `@mavis/local-runtime-v2/.../canonical-agent-config.ts` | 25,165 | `7d9188d1099623e4e7f66649b4455c2fe8bff05e1fcc6fd25f346089928877bc` | Canonical custom agents accept exact tool/MCP/Skill selectors. |
| `@mavis/local-runtime-v2/.../local-turn-tool-catalog.ts` | 18,530 | `0803d213cff55f23596f3bba62fbb64c1b963431bca817cd5685122ae5f61f04` | Selectors filter ready tools before child Turn assembly. |
| `@mavis/agent-tools/.../builtin-defs.ts` | 52,389 | `38dc7f5f17ef4073da44ffb17990ec54337e501a38bb26be2d6a259feb18e9a1` | Native task/Mavis schemas and available management operations. |
| `@mavis/local-runtime/.../local-task-runner.ts` | 8,052 | `993444caf9c995b0d5e544243023bc669ef9f0f5c38a97ae907850c6b06bdf6b` | Child sessions inherit the parent workspace and freeze the selected agent. |
| marketplace renderer chunk | 434,426 | `ffc7d6f8cd719409861d014e06cbbde02c81836b1fe0604a3af7acb4f32f55ee` | Personal Skills accept local ZIP upload; plugin import requires public Git. |

Static host inspection is architecture evidence, not live enforcement evidence. The alpha.7 blocked
receipt remains valid history and cannot certify alpha.8.
