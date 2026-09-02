# T07 manual Personal Skill discovery probe

Verdict: **PASS — host discovery seam only; T07 and T08 remain BLOCKED**

This receipt records a bounded MiniMax Desktop behavior probe. It does not install, extract, import,
or execute the Cycle artifact. It must not be used as proof of an artifact installation path, package
equivalence, full Cycle workflow behavior, or production distribution.

## Candidate context

- Cycle source context: `c282264f191365e2c755a585f01b514b1cad2852`.
- Canonical alpha.12 TGZ: `minimax-code-cycle-plugin-2.0.0-alpha.12.tgz`, 1,897,358 bytes, SHA-256
  `2cfd63a23df041fd5c5ff7fd2b9a657088ea4fe9bf40ce52b23a26064728a71d`.
- Deterministic alpha.12 Skill archive: `cycle-skill-2.0.0-alpha.12.zip`, 43,391 bytes, SHA-256
  `a82ea6cc23bc36fdc32d607c9206dd8826de6d19330690c60d9d115e5a872aea`.
- Host: Windows x64, MiniMax Code Desktop `3.0.68.134`, authenticated MiniMax-M3.

## Bounded live result

With explicit owner authorization, the supported **Plugins -> Personal -> Create -> Input skill**
editor created one uniquely named T07 discovery probe. Its deliberately minimal instructions require
an exact marker reply and prohibit tool or file actions.

1. The new Personal Skill became searchable through the native Personal UI.
2. In a fresh task, an exact discovery trigger caused MiniMax to display that it read the named
   probe Skill and to return the expected marker. No filesystem, MCP, role, or artifact operation
   was observed.
3. The complete Desktop process tree was stopped and MiniMax was relaunched with the same temporary
   Mavis runtime. The Personal UI still found the probe Skill.
4. A second fresh post-restart task returned the same expected marker.

The restart establishes that this manually created Personal Skill persists in MiniMax's account-level
Personal Skill surface. The Mavis runtime was temporary, but the Personal Skill is not a disposable
artifact installation: its later removal requires a separate action-time owner confirmation.

## Remaining release blockers

- T07-A12-B01 remains open: MiniMax still exposes no local ZIP/archive installation surface for the
  deterministic Cycle Skill archive.
- T07-A12-B02 remains open: the exact alpha.12 Agent Plugin is not publicly published or
  clean-import certified through the supported Git route.
- T07-A12-B03 remains open: this probe does not execute Cycle setup, MCP activation, role workflows,
  recovery, delivery, concurrency, persistence, uninstall, or the repeat-critical battery.

The only valid overall release decision remains **BLOCKED**. The raw test trigger, session paths,
account details, and process output are intentionally excluded from the machine-readable receipt.
