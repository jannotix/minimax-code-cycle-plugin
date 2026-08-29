# Changelog

All notable changes to Cycle for MiniMax Code are documented here.

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
