# Compactness

The Cycle workflow treats code compactness as a quality gate, not as a
style preference. The principle is: the best code is the code that was
not written. The second best is the code that is short because it
reuses what exists.

This document is the principle. The enforcement is in the role
prompts and the security reviewer's triage.

## Levels

There are four compactness levels. The user picks one in
`~/.mavis/cycle/config.json` under `quality.compactness`. The default
is `balanced`.

| Level | When to pick | Effect on the executor |
|---|---|---|
| `terse` | The project values minimum surface area, the team is senior, every line is reviewed | The executor writes the smallest correct change. No new abstractions. No new dependencies. Reuses existing utilities. Refuses to add comments. |
| `balanced` | Most projects | The executor writes the smallest correct change. New abstractions are allowed when they reduce total line count. New dependencies are allowed when justified. |
| `thorough` | New contributors, libraries, public APIs | The executor may add comments for non-obvious behavior. The change may introduce abstractions that grow the line count to reduce coupling. |
| `yolo` | Throwaway scripts, prototypes the user plans to discard | The executor is not bound by compactness. The security reviewer still runs. |

The compactness level is recorded in every `task_summary` so the
reviewer and the arbiter can evaluate against the right bar.

## Rules that apply at every level

1. **A library is a library.** If a function exists in the standard
   library or in a dependency the project already uses, the executor
   uses it. The executor does not re-implement URL parsing, date
   formatting, JSON serialization, hashing, base64, CSV, or HTTP
   request handling.
2. **Two lines, not one hundred.** If the same behavior can be
   expressed in two lines using existing primitives, it is not
   expressed in one hundred lines using new helpers. The compactness
   review is not a line count, it is a primitive count.
3. **A function that is not called is not written.** The executor
   does not pre-build a public API for a future caller. The future
   caller is a future task.
4. **A type that is not used is not declared.** The executor does
   not invent types in anticipation. A type without a use site is
   dead code, and dead code is a defect.
5. **A test that does not run is not written.** The executor does
   not add tests that the project's test runner cannot discover.
   The verification command for the task must include the test
   invocation that runs the new test.

## What the reviewer looks for

The functional reviewer looks for evidence that the executor followed
the rules. The check is mechanical:

- For every new utility, is there a standard library or existing
  dependency that does the same thing?
- For every new dependency, is the dependency pinned, justified in
  the task summary, and licensed permissively?
- For every new public function, is there at least one call site in
  the same task or in an existing caller that the executor
  identifies?
- For every new type, is there a use site in the same task or in an
  existing caller?
- For every new test, is the test name in the verification command
  output?

A failure on any of these is a finding. The severity is `minor` for
an unjustified utility, `major` for an unjustified dependency, and
`blocker` for a public function or type with no use site.
