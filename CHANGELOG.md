# Changelog

All notable changes to Cycle for MiniMax Code are documented here.

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
