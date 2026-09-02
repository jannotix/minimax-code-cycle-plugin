# T07 upstream parent capability issue

Verdict: **BLOCKED — awaiting a host-enforced MiniMax parent-session boundary**

The public alpha.14 candidate remains pinned to source
`95b79d4d674d430fb0ad7d71b7a61b5f4c6ed52b`. This is a tracking receipt for
the host limitation identified during the imported-Skill setup attempt; it is
not a release approval and it does not alter the published candidate.

## Upstream report

- Issue: [MiniMax-AI/minimax-code#138](https://github.com/MiniMax-AI/minimax-code/issues/138)
- Title: `Agent Plugin Skills cannot enforce parent tool restrictions during setup`
- Submitted: 2026-09-03

The report contains a sanitised reproduction and requests either a declarative,
host-enforced parent Skill tool allowlist/denylist or a non-prompt native setup
API. It excludes local paths, raw prompts, session identifiers, command output,
and profile data.

## Release effect

Until MiniMax supplies and documents a testable capability boundary, autonomous
native-only setup remains unclaimable. The available interim contract is a
supervised manual setup flow only; it must not be presented as autonomous or as
a substitute for this gate.
