# Changelog

All notable changes to Cycle for MiniMax Code are documented here.

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
