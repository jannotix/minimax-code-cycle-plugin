# Changelog

All notable changes to Cycle for MiniMax Code are documented here.

## [2.0.0-alpha.16] - Unreleased

Opened because alpha.15 was run live and failed, and the two defects behind that failure are fixed
here. A fix changes the packaged bytes, so alpha.15's receipt cannot describe this candidate; it
stays as the record of that run. See `certification/T07_ALPHA15_SETUP.md`.

### Fixed

- `cycle_setup assess` reported a managed agent absent whenever the caller supplied no native
  snapshot, before looking at the capability profile the control plane had just read from disk. The
  read was added so the plane would stop depending on the coordinator's account of its own work, but
  the short-circuit sat above it, so the one fact the plane can establish itself was the one fact
  this path never consulted. Measured live: five byte-exact profiles reported absent, and the
  coordinator, told its correct work did not exist, deleted all five agents and rewrote them.
- An installed profile that had lost its `tools:` block was read as ordinary staleness and answered
  `update` — "rewrite agent.md" — to the party that had just written it wrong. A profile that
  declares no tool allow-list, or declares a tool outside its role's specification, is now a
  capability change rather than drift: it answers `conflict`, and no branch authorizes the rewrite
  that can produce it. Repairing it silently would hide the event. `assess` also returns the
  allow-list the profile actually declares, so the answer carries the evidence and not only the
  verdict.

### Added

- `certification/T07_ALPHA15_SETUP.md` and its JSON receipt: the first live run to get past import,
  restart and profile creation, and the first to fail on the guarantee rather than on plumbing.

### Note

Alpha.16 has not been run live. The alpha.15 receipt establishes import, restart persistence, MCP
registration and byte-exact profile creation against a real profile; everything past that point
remains uncertified, and the release stays blocked.

## [2.0.0-alpha.15] - Unreleased

### Fixed

- The durable data directory could sit inside the project it governs. The containment check compared
  a resolved path against a canonicalised one, so a junction, a symlink or a Windows short name
  escaped it — measured, not inferred: the store was created inside the project and the doctor
  answered `ok`.
- `engines` promised Node 22 while the store needs 22.13.0 for `node:sqlite`, and the doctor compared
  the major alone, so 22.0 through 22.12 were reported healthy and then failed to open the store.
  Continuous integration now pins the exact floor and loads the shipped runtime on it.
- The published package was not reproducible. `npm pack` packs the working tree, and without a
  normalisation rule git checked text out as CRLF on Windows and LF elsewhere, so the digest depended
  on the machine that packed it. The Skill archive had the same property for a different reason: its
  ZIP timestamp was rendered through local-time getters, which put 1979 in the field west of UTC,
  below the year the format counts from.
- An arbiter that approved over a reviewer's rejection was refused with a throw before anything was
  recorded, so the run re-dispatched the same arbiter with the same prompt and could not converge.
  The refusal is recorded now and routed to repair, and the arbiter is shown both reviews.
- Every commit this delivered claimed it rested on zero recorded gates, because the commit message
  read the manifest frozen before verification while the journal read an enriched copy.
- Reconcile could not tell a delivery that never began from one that ran and aborted, and refused to
  finish work that was safe to finish — which is how a non-interactive run ordinarily ends.
- The index fell back to walking the filesystem when git refused to list the project, so ignored
  files could enter the graph, and a refusal was read as an empty repository and deleted it.
- The signing-key permission check required at most one principal, which no ordinary Windows machine
  can satisfy. It names the accounts it will not accept now, and permits the system principals that
  hold the file regardless.
- Two legacy tools that existed to be distrusted are gone, along with six packaged Skill files that
  described a contract this host does not have — including one that said the executor drives the
  browser, which is the opposite of what the control plane enforces.

### Changed

- `cycle_setup assess` reads the installed capability profile from disk when given the active
  `profile_root`, instead of judging the caller's account of it. The coordinator is the party those
  profiles restrict, so the one fact of a setup the plane can establish on its own it now does; the
  answer names which half is evidence and which is a report.

### Known limitations

- Alpha.15 has no live artifact-install, MCP, role, workflow, recovery, delivery, uninstall or
  repeat-critical-battery certification. The alpha.14 receipts do not carry forward: they name an
  artifact this line no longer produces. Release remains blocked pending a supported, authorized
  public Git import and the complete T07 matrix.

## [2.0.0-alpha.14] - Unreleased

### Fixed

- Replaced the timestamp-bearing `git archive --format=zip` local Skill builder with a sorted,
  fixed-metadata ZIP built from committed Skill blobs. The supply-chain suite now produces two
  independent archives and requires byte-for-byte equality.

### Known limitations

- Alpha.14 has no fresh live artifact-install, MCP, role, workflow, recovery, delivery, uninstall,
  or repeat-critical-battery certification. It remains blocked pending a supported, authorized public
  Git import and the complete T07 matrix.

## [2.0.0-alpha.13] - Unreleased

### Changed

- Froze a fresh candidate after alpha.12 evidence became historical. Every active version surface,
  generated supply-chain inventory, and package provenance is rebound to alpha.13.
- Recorded the supported MiniMax Personal Skill editor's bounded discovery and restart-persistence
  seam separately. That account-level probe is not an artifact installation or distribution claim.

### Known limitations

- Alpha.13 discovered that `git archive --format=zip` changes Skill archive bytes between same-SHA
  builds. It is superseded by alpha.14 and must not be distributed.

## [2.0.0-alpha.12] - Unreleased

### Fixed

- Removed unsupported Mavis MCP description/environment persistence from the native setup contract.
  Native ownership now uses an exact, persisted Node owner argument, and the control plane derives
  profile-scoped storage from inherited `MINIMAX_DATA_DIR` when `CYCLE_DATA_DIR` is unavailable.

### Known limitations

- Alpha.12 T07 verified persisted MCP ownership, profile-scoped storage, five role profiles, and
  live child rosters. Public Git import remains unauthorized/uncertified, and the observed Desktop
  Personal Skills editor still has no local ZIP upload control, so no distribution channel is
  certified.
- Workflow recovery, delivery, provider/concurrency behavior, uninstall, and the 20-run critical
  battery remain release gates. A manual executor write probe did not count because its parent used
  a forbidden terminal workspace check.

## [2.0.0-alpha.11] - Unreleased

### Fixed

- Added a mandatory, user-confirmed active `profile_root` and a deterministic per-role
  `profileRelativePath` to the setup contract. The coordinator can now write only the canonical
  target without Terminal or shell discovery, then require native `agent get` and
  `cycle_setup assess: noop`.
- Retried SQLite's exclusive WAL/startup-migration transition only for bounded lock errors so
  concurrent first opens converge rather than intermittently failing the production gate.

### Known limitations

- Alpha.11 T07 proved the five shell-free role profiles, but MiniMax `mcp create/update` discarded
  the configured environment and description. Alpha.12 must align the MCP contract with fields the
  host actually persists and prevent any default-user-data leak in disposable certification.
- The observed Desktop Personal Skills editor still has no local ZIP upload control, so no local
  Skill archive distribution channel is certified.

## [2.0.0-alpha.10] - Unreleased

### Fixed

- Made canonical Custom Agent `agent.md` the explicit and sole system-prompt authority in the
  setup procedure and `cycle_setup` specification. Setup now writes, hashes, reads back, and
  requires `cycle_setup assess: noop`; it never attempts the unsupported native
  `agent update system_prompt` mutation.

### Known limitations

- Alpha.10 T07 proved the no-`agent update` round-trip only when the canonical `agent.md` target was
  supplied explicitly. Its first guided setup used a forbidden terminal path-discovery fallback, so
  alpha.11 must make that root handoff explicit before a fresh role-certification run.
- The observed Desktop Personal Skills editor still has no local ZIP upload control, so no local
  Skill archive distribution channel is certified.

## [2.0.0-alpha.9] - Unreleased

### Changed

- Corrected the native setup order from live MiniMax evidence: write and byte-verify canonical
  `agent.md` before updating the matching native `system_prompt`, because the local runtime rejects
  a prompt/profile mismatch.
- Corrected distribution documentation: MiniMax Code Desktop `3.0.68.134` exposes a manual Personal
  Skill editor, not a local Skill ZIP upload control. The deterministic ZIP remains an integrity
  artifact, not a certified installation channel.

### Known limitations

- Alpha.9 live T07 found that native `mavis agent update` rejects a Custom Agent `system_prompt`
  update after the canonical `agent.md` already yields a `noop` assessment. The release remains
  blocked pending a new procedure version and fresh live certification.

## [2.0.0-alpha.8] - Unreleased

### Changed

- Replaced unsupported agent hook setup with MiniMax canonical custom-agent capability profiles.
  Four roles expose only `read`, `grep`, and `glob`; the executor additionally exposes `write` and
  `edit`. Shell, Git, delegation, `mavis`, MCP, memory, browser mutation, and future tools are absent
  from the runtime catalog rather than discouraged by prompts.
- Added the supported local installation path: a standard Git-archive Skill ZIP uploaded through
  MiniMax Personal Skills plus native `mavis mcp create` for the extracted canonical MCP server.
- Upgraded setup and receipt contracts to v2 with byte-exact profile digests and separate offline
  and live capability-profile verification.

### Removed

- Removed the `PreToolUse` hook files that MiniMax `3.0.68.134` cannot register through its native
  management surface.

## [2.0.0-alpha.7] - Unreleased

### Added

- Added a requirement-to-test map covering every production tranche through T06.
- Added a standard `npm pack` TGZ builder with a strict runtime allowlist, independent extraction
  and MCP startup verification, SHA-256 checksum, artifact manifest, and provenance sidecars.
- Added a CycloneDX runtime SBOM, machine-readable license inventory, high-confidence artifact secret
  scan, security policy, and pinned Windows/macOS/Linux core CI.

### Changed

- Made the full local gate run typecheck, build, behavioral tests, traceability, supply-chain
  inventories, secret scan, and second-directory canonical artifact verification.
- Kept production blocked until the disposable-profile live MiniMax certification in T07.

## [2.0.0-alpha.6] - Unreleased

### Added

- Production coordinator Skill with exact-request intake, durable reconcile/resume, one-action state
  planning, native task/session dispatch, provider-failure pause, and truthful state reporting.
- Read-only `cycle_coordinator` planner returning deterministic `status`, `summary`, `next_actions`,
  `artifacts`, and one legal dispatch/control/stop action.
- Durable native Mavis role-session bindings. One session can serve only one workflow role;
  functional/security reviewers are distinct and each repaired candidate requires fresh reviewer
  and arbiter sessions.
- Explicit `bind_role_session` before role-output parsing, so malformed output is corrected by the
  same accountable session rather than silently replaced.
- Blind parallel reviewer dispatch plus two-stage functional browser capture and security proof
  request flows that resume the originating native session with new evidence identifiers.

### Changed

- Role agents no longer invoke Cycle governance operations directly. The coordinator binds and
  submits their outputs, while the control plane remains the only transition authority.
- Profile-local setup receipts are revalidated on every run and must be `ready`; stale or
  `installed_unverified` setup stops dispatch.

### Security

- Missing native mavis/task/browser capability, invalid role output, provider failure, reused role
  sessions, review cross-contamination, and internal transition drift all fail closed.

## [2.0.0-alpha.5] - Unreleased

### Added

- Explicit, natural-language native Mavis setup for five uniquely named `cycle-v2-*` user agents,
  with deterministic create/update/noop/conflict assessment through `cycle_setup`.
- Agent-scoped Mavis `PreToolUse` guard and offline negative tests: read-only roles fail closed to an
  inspection allowlist; the executor cannot delegate, govern Cycle, touch `.git`, stage, commit, or
  run a mutating/unknown Git operation.
- Native `agent get`/`agent list` round-trip requirements, rollback journal, sanitized receipt schema,
  and marker-safe reversible uninstall that preserves durable Cycle data.
- Current strict JSON role prompts and plan/review/arbitration templates aligned with the T02 control
  plane schemas and MiniMax snake-case MCP arguments.

### Changed

- Per-agent models are no longer claimed from profile YAML. Setup records the effective inherited
  session model unless the native API proves a per-agent model through a write/read round-trip.
- Hook registration, offline guard execution, and live role-session dispatch are separate gates.
  Setup remains `installed_unverified` until T07 proves enforcement on the current MiniMax build.

### Security

- Plugin installation has no profile side effects; setup and uninstall require separate explicit
  user requests and refuse foreign agent-name collisions before mutation.

## [2.0.0-alpha.4] - Unreleased

### Added

- Bundled, MIT-licensed Tree-sitter WASM runtime and twelve grammar artifacts with a byte-exact
  allowlist, SHA-256 manifest, third-party notices, and no native binary or dynamic download path.
- Incremental project code graph with stat-cache no-read behavior for unchanged files, one-file
  deltas, delete/rename cleanup, confidence-tagged edges, verification preemption, and bounded
  queries that report truncation.
- Durable, project-scoped memory with evidence provenance, progressive retrieval, supersession,
  explicit revocation, and cross-project isolation.
- Goal Mode with immutable objectives, versioned plans, workflow milestones, bounded continuation,
  pause/resume, and explicit completion or abort confirmation.
- Workflow integration that links focused goals, records verified delivery memory, remembers failed
  approaches at terminal repair exhaustion, and survives process restart.
- Full measured-admission tests including resource pressure, fair leases, expiry, recovery
  throttling, and 100 registered workflows.

### Security

- Code indexing and worker parsing reject traversal, symlink, and NTFS junction boundaries.
- Memory explain, chain, and revocation operations reveal no cross-project records.

## [2.0.0-alpha.3] - Unreleased

### Added

- Exact candidate manifests binding Git base, diff, changed paths, dependencies, configuration,
  environment, file digests, and bounded approved-byte payloads.
- Deterministic gate discovery and safe command execution without a shell, with timeout and output
  caps whose digest covers the complete output.
- Candidate integrity, secret scan, required-layer, design, browser/accessibility, and proof evidence.
- Strict plan and verdict schemas with evidence-id and requirement coverage validation.
- Independent review and arbitration transitions that cannot approve without mandatory evidence.
- Journaled, atomic, idempotent delivery, commit, and crash recovery.
- Rename-aware manifests that deliver the added destination and deleted origin together.

### Security

- Candidate reads, proof copies, and delivery writes reject traversal, symlinks, and junctions.
- Linked Git worktrees use `git rev-parse --git-path` to detect in-progress operations.

## [2.0.0-alpha.2] - Unreleased

### Added

- Explicit multi-project identity and durable per-user data paths.
- SQLite store with forward-only migrations and safe read-only handling of newer schemas.
- Concurrent first-open migration coordination across multiple MCP processes.
- Durable workflow start, routing, deduplication, amendments, pause/resume/retry/cancel, and restart.
- Append-only, secret-redacted history with Ed25519 checkpoints and permission diagnostics.
- Measured resource admission with fair, expiring leases.
- Strict MCP parsing plus workflow, history, limits, and doctor tools.

### Changed

- Raised the Node.js runtime floor to 22 for the built-in SQLite API.
- Replaced the legacy MCP entry point with the compiled TypeScript control plane.

## [2.0.0-alpha.1] - Unreleased

### Changed

- Declared the rebuild as a blocked development line rather than a production release.
- Replaced unsupported command and bundled-agent claims with the public MiniMax Agent Plugins 1.0
  boundary.
- Defined the native Mavis-agent setup and MCP control-plane target architecture.
- Aligned active version surfaces on `2.0.0-alpha.1`.
- Restricted graph-query advertising to operations the current implementation actually supports.

### Security

- Disabled the malformed legacy tar packager so it cannot produce another release artifact.
- Clarified that the legacy audit verifier checks internal chain consistency but not authenticity.
- Clarified that the legacy candidate manifest is diagnostic and cannot authorize delivery.

### Distribution

- Kept FSL-1.1-MIT unchanged by owner decision.
- Recorded official MiniMax registry acceptance as an external blocked gate while that registry
  requires an open-source license.
