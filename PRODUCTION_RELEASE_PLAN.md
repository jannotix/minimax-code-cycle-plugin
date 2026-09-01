# Cycle for MiniMax Code Production Release Plan

Status: **BLOCKED — alpha.8 live T07 evidence recorded; alpha.9 remediation requires a fresh live T07**

Development version: `2.0.0-alpha.9`

Initial source baseline: `f23115d51d4fe5bbe816ed20a953c63b1fe0bbdf`

Claude Code reference baseline: `7eae1f52de25695d2ffbdc7b362396730e2d5e89`

## 1. Authority and non-goals

This file is the release source of truth for the MiniMax Code variant. The user's explicit decisions
override this plan. Source, tests, documentation, packaging, and runtime receipts are written in
English. User-facing reports may be localized.

Owner decisions recorded for this program:

- Keep the existing FSL-1.1-MIT declaration and license text unchanged.
- A disposable MiniMax Code profile may be used later for live certification.
- Work proceeds as one task and one atomic local commit at a time.
- Do not push, tag, publish, open a pull request, create a GitHub Release, or modify a public
  marketplace without separate authorization.
- Do not reuse certification evidence after any source or packaged-byte change.

This program does not claim that MiniMax Code Agent Plugins load custom commands, agents, hooks,
workflows, LSP configuration, or UI extensions. It does not use UI clicking, clipboard automation,
or an undocumented local endpoint as the primary integration mechanism.

## 2. Product contract

### 2.1 Portable package

The portable Agent Plugin contains only standard components:

- root `plugin.json`;
- root `mcp.json`;
- one immediate Skill directory at `skills/cycle/`;
- a dependency-free Node.js MCP control plane and its packaged resources;
- required license, notice, security, changelog, SBOM, and provenance documents.

### 2.2 Full-fidelity setup

Full five-role operation is enabled only after an explicit user setup request. The Cycle Skill uses
native Mavis operations to create or update user-owned agents and installs canonical capability
profiles with exact tool/MCP/Skill selectors. Setup must be idempotent, reversible, and independently
verifiable. Installation by itself has no persistent
side effects outside the plugin directory.

The roles are:

1. architect — read-only plan and requirement coverage;
2. executor — bounded implementation and verification, never approval;
3. functional reviewer — independent completeness and end-to-end review;
4. security reviewer — independent security and architecture review;
5. arbiter — read-only final decision against the immutable original request.

The coordinator relays role outputs but cannot approve a candidate. The control plane validates
plans, evidence identifiers, review independence, requirements, state transitions, and delivery.

### 2.3 Durable data

Workflow state, history, memory, graph data, candidates, and recovery journals live outside the
MiniMax Code installation and outside the plugin package. The data directory is explicit or uses a
documented per-platform user-data location. Plugin uninstall never silently deletes durable Cycle
history.

## 3. Capability matrix

| Capability | Claude reference | Current development line | Production requirement |
|---|---:|---:|---|
| Agent Plugin manifest | yes | yes | schema-validated |
| Natural-language Skill | commands plus Skills | T05 coordinator contract; live pending | coordinator with fail-closed setup check |
| MCP server | full control plane | T05 core plus setup/coordinator planners and two legacy diagnostics | full control plane |
| Persistent state machine | yes | yes at T01 | SQLite, migrations, legal transitions |
| Five isolated roles | plugin agents | T05 durable dispatch/session contract; live pending | native Mavis agents created on explicit setup |
| Tool boundaries | declarations plus hook | T07R canonical agent allowlists; live dispatch pending | code-gated role profiles plus post-task reconciliation |
| Evidence engine | yes | yes at T02 | discovery, execution, timeout, cap, secret scan |
| Candidate integrity | byte snapshot | yes at T02 | exact base and approved-byte snapshot |
| Atomic delivery | journaled | yes at T02 | fail-closed, recoverable, idempotent |
| Signed history | Ed25519 checkpoints | yes at T01 | append-only chain plus protected checkpoints |
| Code intelligence | Tree-sitter incremental | yes at T03 | Tree-sitter WASM, incremental, bounded queries |
| Memory and goals | yes | yes at T03 | provenance, scopes, confirmation gates |
| Resource admission | yes | yes at T01 | measured reserves and fair leases |
| Automated tests | 466 executed at reference SHA (465 pass, 1 platform skip) | T00–T06 map; 323 executed locally (322 pass, 1 platform skip) | requirement-mapped suite |
| CI and packaging | yes | canonical TGZ verified locally; pinned three-OS core workflow configured but not remotely run | OS matrix, allowlist, SBOM, checksums, provenance |
| Live MiniMax receipt | n/a | alpha.7 receipt retained; alpha.8 MCP live handshake passed but distribution/setup gates blocked; alpha.9 recertification pending | clean install and behavioral matrix |

No row moves to `yes` from documentation or an agent report. A deterministic test, direct runtime
observation, or an exact artifact receipt is required.

## 4. Platform and distribution policy

- Windows: production certification target, using MiniMax Code Desktop `3.0.68` initially and the
  current supported stable build at final release.
- macOS: exactly `compatible but untested` until native Desktop evidence is recorded.
- Linux: Node control-plane CI only; no MiniMax Code Desktop claim.
- Node.js: 22 is the runtime floor; release testing includes the floor and the current development
  version.

The owner keeps FSL-1.1-MIT unchanged. Direct GitHub distribution may proceed only after all
technical gates and owner publication approval. A local distribution channel remains blocked until
an exact supported-UI install path is live-certified. Official MiniMax registry distribution stays
blocked unless its maintainers explicitly accept the license. A mechanical validator pass cannot
override a human licensing decision.

## 5. Atomic task sequence

### T00 — Contract and release baseline

Allowed paths:

- `README.md`
- `PRODUCTION_RELEASE_PLAN.md`
- `CHANGELOG.md`
- `package.json`
- `plugin.json`
- `.gitignore`
- `mcp/cycle-server.mjs`
- `scripts/graph-query.mjs`
- `scripts/package-skill.mjs`
- `skills/cycle/SKILL.md`
- `skills/cycle/PROTOCOL.md`
- `tests/contract.test.mjs`

Required outcome:

- one truthful public contract with no plugin command or bundled-agent claim;
- license decision recorded without changing the license;
- coherent development version `2.0.0-alpha.1` in every active version surface;
- unsupported graph operations fail explicitly instead of succeeding with empty output;
- broken legacy packaging fails closed;
- an automated contract test prevents regression;
- release status remains blocked.

Verification:

- `npm test`
- `node --check` for every runtime script
- JSON parse of both manifests
- `git diff --check`
- exact staged-path review before commit

Rollback: revert the single T00 commit. No migration or external state exists.

Stop after the atomic local commit and report its SHA. Do not start T01 automatically.

### T01 — Control plane, store, and history

Port and adapt the host-independent Claude control-plane foundation: project identity, platform data
paths, configuration, SQLite store, migrations, append-only history, Ed25519 checkpoints, state
machine, admission leases, diagnostics, and MCP protocol. Every operation carries or resolves an
explicit project root; plugin-root `cwd` is never treated as the user's project.

Exit evidence: unit and integration tests for migrations, restart, project isolation, state
transitions, history tampering, checkpoint verification, resource failure, and MCP malformed input.

### T02 — Candidate, evidence, and delivery

Port exact candidate capture, payload budgets, dependency/config inclusion, required-gate discovery,
safe command execution without a shell, timeouts, full-output digests, secret scanning, evidence
storage, verdict validation, atomic delivery, commit policy, crash recovery, and idempotence.

Exit evidence includes dirty/untracked/rename/delete/symlink/reparse cases, candidate mutation before
verification and delivery, interrupted delivery recovery, missing executable, timeout, output cap,
and scope reconciliation.

### T03 — Code intelligence, memory, goals, and admission

Port the audited Tree-sitter WASM runtime and licensed grammars, incremental index, confidence-tagged
edges, bounded queries, memory provenance, Goal Mode, and measured admission control. Keep native
binaries and dynamic downloads out of the package.

Exit evidence includes all supported languages, unchanged-file no-read behavior, one-file delta,
delete/rename, bounded query truncation, restart, 100 registered workflows, resource pressure, and
the controlled 500,000-file benchmark if the public claim remains.

The development line makes no 500,000-file performance claim, so that conditional benchmark is not
an exit gate. T03 instead records bounded incremental behavior and defers scale claims until a
controlled benchmark is specified and executed.

### T04/T07R — Native Mavis agents and capability profiles

Create a natural-language, explicit, idempotent setup procedure. It creates uniquely named user-owned
role agents in a disposable profile during certification, installs byte-exact canonical `agent.md`
capability profiles, verifies every agent through the native Mavis API, records model configuration,
and provides a reversible uninstall that preserves Cycle data unless separately requested.

No setup action runs from plugin installation alone.

MiniMax `3.0.68` exposes agent management through the native model tool, not the installed connector
CLI. Setup preflights all five names, refuses foreign collisions before mutation, and uses only
native `agent create/update/get/list/delete` operations whose current arguments are discovered with
`agent help`. Per-agent model YAML is not evidence: the receipt records the inherited session model
unless a native write/read round-trip proves another model.

MiniMax `3.0.68.134` exposes no native hook-management surface. T07R therefore uses the runtime's
canonical custom-agent selectors: read-only roles allow only `read`, `grep`, and `glob`; executor
adds `write` and `edit`; every role has empty MCP and Skill selectors. Shell/Git, delegation,
`mavis`, memory, browser mutation, Cycle governance, and unknown future tools are absent from the
child catalog. Byte verification produces `installed_unverified`; only T07 live roster and behavior
probes on the exact MiniMax build may produce `ready`.

### T05 — Cycle coordinator Skill

Replace the alpha Skill with the production coordinator. It captures the exact request, drives the
control plane, sends role prompts to separate Mavis sessions, keeps reviewers blind to one another,
submits only schema-valid outputs, resumes from durable state, and reports the returned state without
inventing success. Missing agents, capability profiles, evidence, or browser capability stop the cycle.

The coordinator validates a profile-local `ready` setup receipt on every run and requires live
native `mavis` and `task` capabilities. A read-only planner returns exactly one next action from the
durable workflow state. New roles use the exact managed native agent; malformed results, browser
captures, and proof requests resume the same bound session. Provider/session failure pauses instead
of falling back inline.

Native role bindings are stored in schema version 8 and included in append-only history. One session
cannot serve two roles. Reviewers use distinct sessions, are dispatched before either result is
consumed, and never receive one another's verdict. A repaired candidate requires fresh reviewer and
arbiter sessions. Delivery remains a control-plane transition after evidence and arbitration, never
a coordinator judgement.

### T06 — Test, CI, and supply chain

Complete the requirement-mapped suite, typecheck/build pipeline, standard artifact builder, package
allowlist, third-party notices, SBOM, checksums, provenance, secret scan, license inventory, and
Windows/macOS/Linux-core CI. A second clean directory must independently list, extract, hash, start,
and test the canonical artifact.

The legacy custom tar writer is not reused.

T07R adds a deterministic local-channel candidate: `git archive` produces
`cycle-skill-<version>.zip` from the committed Skill tree and an independent archive reader extracts
and hashes it. Live Desktop `3.0.68.134` exposes only a manual Personal Skill editor, not a ZIP
upload control, so this archive is not a certified installation channel. Public Git import remains
the Agent Plugin candidate after publication and requires its own exact live-install proof.

### T07 — Live MiniMax Code certification

Use the authorized disposable MiniMax profile. Record sanitized receipts for fresh local install,
Skill discovery, MCP handshake, agent creation, capability-profile enforcement, advisory roles, quick/full cycles,
repair, blocked, retry, pause/resume, application restart, provider failure, concurrent projects,
candidate delivery, uninstall, and state persistence. Run the critical deterministic battery twenty
times without relaxing timeouts or fail-closed checks.

Live receipts bind the exact clean source SHA and exact artifact SHA-256. Raw prompts, credentials,
absolute user paths, private configuration, and raw process output are excluded.

Current verdict: **BLOCKED**. On Windows x64 with MiniMax Code Desktop `3.0.68.134`, the live native
`mavis` tool rejected `plugin help` and advertised only `agent`, `cron`, `session`, and `mcp`. It has
no plugin installation or Skill inspection group. Its live `agent create/update` contracts also
expose no hook or tool-policy field. The activation gate therefore failed before installation,
discovery, MCP activation, role setup, or downstream behavioral certification. No forbidden fallback
was used. See `certification/t07-live-certification.json` and
`certification/T07_LIVE_CERTIFICATION.md`.

The alpha.8 live probe proved a MiniMax-owned MCP handshake after a full application restart, but it
also proved that local ZIP Skill upload is absent from the observed UI and that complete role setup
was not reconciled. Alpha.9 corrects the setup order: write and byte-verify canonical `agent.md`
before native `agent update` writes the matching `system_prompt`. The alpha.7 and alpha.8 receipts
remain historical evidence and do not certify alpha.9.

### T08 — Release and distribution gate

Prepare release notes, artifact inventory, checksums, SBOM, provenance, rollback, and clean-install
instructions. Registry submission remains conditional on an explicit FSL acceptance. Owner approval
`AUTHORIZED TO PUBLISH` is required before any push/tag/release action. `PUBLIC RELEASE VERIFIED`
is recorded only after a separate public clean-install check; otherwise the release is withdrawn.

## 6. Release evidence contract

Every task receipt records:

- task id and exact local commit SHA;
- clean/dirty Git state and approved paths;
- command, environment class, exit status, and compact result;
- artifact name, semantic version, byte size, and SHA-256 where applicable;
- test counts and any skip with a justified platform reason;
- reviewer verdict and unresolved gaps;
- rollback command or procedure.

Evidence becomes stale after any source, dependency, build configuration, packaged resource, or
artifact-byte change. Stale evidence is retained as history but never satisfies a current gate.

## 7. Final production gate

Production requires all of the following on one exact candidate:

- clean source SHA and coherent versions;
- no critical/high unresolved finding;
- complete automated suite and contract checks;
- exact artifact allowlist, SBOM, checksum, and provenance;
- independent extraction/start/test from a second directory;
- live Windows MiniMax Code matrix and repeat-critical battery;
- macOS labeled `compatible but untested` unless native evidence exists;
- rollback rehearsal;
- explicit owner publication approval;
- post-publication clean-install verification.

Until every applicable item passes, the only valid verdict is `BLOCKED`.
