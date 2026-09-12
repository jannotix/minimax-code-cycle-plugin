# Cycle for MiniMax Code — user manual

For `2.0.0-alpha.16`.

> This is a development line and its release is blocked. This candidate has no live behavioural
> certification; the one before it was run live and failed. What follows describes what the plugin
> does — it does not claim any of it has been proven on a real MiniMax profile, beyond the little
> the previous run established. See [Release boundary](#release-boundary).

---

## What it is

A single coding session interprets your request, implements it, and then decides for itself that the
work is done. The same blind spot shapes all three steps, so what comes back can be an endpoint with
no interface reaching it, a migration written but never run, or tests that cover a mock while the
real integration stays broken.

Cycle separates those steps into five roles that run in their own MiniMax sessions: an architect
that plans, an executor that is the only role permitted to write files, two independent reviewers
that never see each other's verdict, and an arbiter that judges the frozen result against **your
original request** — not against the architect's summary of it.

It does not make a model cleverer. It makes an unverified claim of completion fail.

## Requirements

- MiniMax Code with the native `mavis` and `task` tools available to the session.
- Node.js **22.13.0 or later** on `PATH`. The store is built on `node:sqlite`, which is unflagged
  only from that version; on anything older `cycle_doctor` reports `runtime.node` and the store will
  not open.
- Git. The plugin delegates its ignore policy and its change set to git, and refuses to index or
  freeze anything git will not list.

No network calls, no account, no telemetry, and no runtime package dependencies.

## Using it

There is **no command namespace**. You ask in your own words, and the Skill routes the request.
`/cycle …` is not a thing here and never has been on this host — MiniMax exposes Skills and MCP
servers to plugins, not commands.

Ask for governed work the way you would ask for the work:

> Add rate limiting to the public API, governed by Cycle.

Ask about state the same way — "what is Cycle doing", "resume the cycle", "pause it", "cancel it".

**Routing.** The control plane decides whether a request takes the quick route or the full cycle,
from the request text and the paths it names. Markers cover authentication, authorization,
cryptography, secrets, persistence, payments, personal data, release and rewrites, in several
languages, plus path rules for migrations, packaging, deployment, dependency manifests and CI. Any
one of them promotes the request to the full cycle. You can say "quick" or "full" to force it; a
forced route is recorded as forced.

**What the quick route still does:** freezes an exact candidate, runs the mandatory gates, and passes
an arbiter. What it does not do is the two independent reviews.

## Setup

Setup is a separate, explicit request. It never runs when the plugin is installed.

It creates five user-owned `cycle-v2-*` agents in your MiniMax profile through the native tool, and
writes one capability profile per role. You must supply the absolute path of the active profile — the
plugin does not go looking for it, and it will not accept a path found through a shell.

Read [`skills/cycle/setup/PROCEDURE.md`](../skills/cycle/setup/PROCEDURE.md) in the installed plugin
for the full sequence. Uninstall is equally explicit, requires confirmation, deletes only agents
Cycle owns, and **leaves the durable database alone** — a history of delivered work outlives the
plugin.

### What the control plane verifies, and what it is told

The coordinator is an ordinary MiniMax session, and this host gives no way to constrain which tools
it may use. The party these capability profiles restrict is therefore also the party that installs
them.

One fact about that is a local file, so the plane reads it: given the profile root, `cycle_setup
assess` opens the installed `agent.md` itself and judges those bytes. Reporting a profile you did not
write answers `conflict`.

Everything else is reported, and the answer says so. The agent's native name, description and system
prompt live in MiniMax's own store, which the plane cannot query; whether the live child roster
matches, and whether a role was dispatched at all rather than imitated, are invisible to it. Treat a
`ready` receipt as the coordinator's account of the parts the plane could not read. The gap needs a
host-enforced parent boundary, which [upstream issue
#138](https://github.com/MiniMax-AI/minimax-code/issues/138) asks for and which does not exist today.

## What is delivered

A candidate is frozen byte for byte before any gate runs: the commit it sits on, every changed path
with the digest of its bytes, and the bytes themselves.

Delivery compares the working tree against that record, writes the approved bytes back, verifies
every digest again, and commits exactly those paths. A file somebody edited after approval stops the
delivery; a file that was lost is restored. Every step goes through a journal, so a delivery
interrupted by a crash is finished rather than guessed at, and never committed twice.

The commit subject is your request in your words. Its body names how many gates it rests on, and its
trailers carry the base revision, the candidate digest and the workflow.

## The ten tools

You will rarely call these yourself — the Skill does. They are listed so you can read a transcript.

| Tool | Operations |
|---|---|
| `cycle_doctor` | installation, storage, store schema, history chain, checkpoints, key permissions, configuration |
| `cycle_setup` | `spec`, `assess`, `uninstall`, `validate_receipt` |
| `cycle_coordinator` | `next` — one legal action, read-only, never mutates state |
| `cycle_workflow` | `start`, `status`, `amend`, `control`, `submit_plan`, `report_task`, `freeze_candidate`, `verify`, `evidence`, `submit_review`, `submit_browser_evidence`, `run_proof`, `arbitrate`, `deliver`, `reconcile`, `bind_role_session` |
| `cycle_history` | `list`, `verify`, `checkpoint` |
| `cycle_limits` | `status`, `usage`, `prune`, `admit`, `renew`, `release` |
| `cycle_graph_index` | incremental index of supported source |
| `cycle_graph_query` | `status`, `symbol`, `neighbours`, `impact`, `scope` |
| `cycle_memory` | `search`, `explain`, `chain`, `forget` |
| `cycle_goal` | `new`, `list`, `focus`, `plan`, `link`, `amend`, `status`, `advance`, `extend`, `pause`, `resume`, `complete`, `approve`, `abort` |

## Configuration

Four environment variables, read when the server starts. A value the server rejects is reported by
`cycle_doctor` as `config.invalid` rather than silently ignored.

| Variable | Values | Default |
|---|---|---|
| `CYCLE_GATE_STRICTNESS` | `advisory`, `standard`, `strict` | `standard` |
| `CYCLE_SECURITY_PROOFS` | `on`, `off` | `off` |
| `CYCLE_MAX_REPAIR_CYCLES` | integer 1–20 | `5` |
| `CYCLE_DATA_DIR` | absolute path | platform default, below |

**Gate strictness.** `standard` fails a change whose layer has no proof. `strict` also fails on a
skipped gate and on an unresolved reach. `advisory` records a missing gate as a warning instead of
failing — the record is still made; the point of the knob is what blocks, never what is written down.

**Security proofs.** Off by default, and deliberately. With proofs on, a security reviewer that
claims a vulnerability writes a proof and the control plane runs it against a disposable copy of the
candidate — **with your privileges and no operating-system sandbox**. Off, the reviewer states the
suspicion instead and an undemonstrated critical is downgraded rather than discarded.

### Where the data lives

In order of precedence:

1. `CYCLE_DATA_DIR`, if set.
2. `MINIMAX_DATA_DIR`, if inherited — gives a profile-scoped directory.
3. The platform default:
   - Windows: `%LOCALAPPDATA%\Cycle for MiniMax Code`
   - macOS: `~/Library/Application Support/Cycle for MiniMax Code`
   - Linux: `$XDG_DATA_HOME/cycle-minimax`, or `~/.local/share/cycle-minimax`

**It must sit outside the project it governs.** A store inside the project would be captured by the
candidate freeze it exists to stand outside of. The check compares canonical paths, so a symlink or a
junction cannot slip past it, and `cycle_doctor` reports `storage.inside_project` if you try.

### Store size

`cycle_limits usage` reports what is retained and what of it can be given back. `cycle_limits prune`
gives it back, and tells you what it would free unless you confirm.

Pruning takes only the retained **bytes** of finished workflows' candidates. Every row, digest,
evidence entry and history link stays, so what a candidate contained remains provable after it stops
taking room. A running workflow keeps its bytes whatever anyone asks.

## The record

Every decision is appended to a hash chain, and checkpoints are signed with an Ed25519 key that never
leaves your machine. `cycle_history verify` re-validates the chain and every signature;
`cycle_doctor` does it at startup. If the record was altered, it says so and names the entry.

The key is restricted to your account. On Windows, the system and administrator principals are
permitted — they hold any file on the machine whatever its ACL, and the POSIX side concedes the same
point, because `0600` does not keep root out either. Any other account, or any group meaning more
than one person, is reported by name as `history.key_permissions`.

## When something goes wrong

Ask Cycle to recover; the Skill reads its own recovery reference. What it does:

- **After a restart**, `reconcile` restores the workflow from the durable store rather than from the
  conversation. A workflow found in delivery is one of three things and it tells them apart: a
  promotion journaled and interrupted is finished from the approved bytes; a promotion that never
  began is run through the same path a cycle uses, which re-verifies every approved byte first; an
  attempt that ran and aborted is left to you, because that is the one case a person has to look at.
- **A provider or role-session failure** pauses the workflow and releases its admission. It does not
  fall back to doing the work inline.
- **A malformed role output** is returned to the same bound session for correction, at most twice. A
  third pauses the workflow rather than starting a replacement session that would erase who did what.
- **A missing browser capability**, where the change touches an interface, stops the cycle. A gate
  that cannot run has not passed.

### Doctor findings

| Code | Means |
|---|---|
| `runtime.node` | Node is below 22.13.0; the store cannot open |
| `storage.inside_project` | the data directory is inside the project it governs |
| `store.open` | the store could not be opened |
| `store.newer` | the store was written by a newer Cycle than this one |
| `history.chain` | the append-only chain failed verification at a named entry |
| `history.checkpoint` | a signed checkpoint failed verification |
| `history.key_permissions` | the signing key is readable by someone it should not be |
| `history.unsigned` | history exists with no signed checkpoint yet (a warning) |
| `config.invalid` | an environment value was rejected; it names which |
| `admission.pressure` | the machine is under measured resource pressure (a warning) |

## Release boundary

Alpha.16 has no live behavioural certification. Alpha.15 was run, and failed — the receipt is
`certification/T07_ALPHA15_SETUP.md`. The alpha.14 receipts do not carry forward: they name an
artifact this line no longer produces.

That alpha.15 run did establish some of this against a real profile: the plugin imports from the
public Git route with bytes matching its commit, survives a restart, registers its server, and
writes five byte-exact capability profiles. It then failed, and the failure was the important part —
the coordinator was told its correct profiles were absent, rewrote all five, and dropped the tool
allow-list from every one of them without anything objecting. Both defects are fixed in alpha.16,
and neither fix has been proven live.

What remains **not** certified is everything past that point: that the profiles are enforced, that
five roles are dispatched and answer, and that a cycle completes through browser evidence, provider
failure, concurrency, delivery and uninstall.

What **is** established: the control plane's own suite, green on Windows, macOS and Linux and on the
oldest Node the manifest declares; and that both published archives are reproducible off the machine
that builds them.

Until every applicable gate passes on one exact artifact, this is not production-ready and its
release is blocked. `PRODUCTION_RELEASE_PLAN.md` is the source of truth for that.

## Licence

FSL-1.1-MIT — Fair Source, **not** OSI open source. Each release becomes MIT two years after it
ships. See `LICENSE`.
