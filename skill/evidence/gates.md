# Evidence gates

A workflow advances only when its mandatory gates are satisfied. A gate
is a set of evidence records with a `passed` status. Evidence is real:
a `passed` record corresponds to a command that exited zero, an
attachment that loaded, or a manual confirmation the executor captured
from a browser or a user dialog.

## Mandatory gates

| Gate | What must pass | When |
|---|---|---|
| Build | The project's build command exits zero | before reviews |
| Type check | The project's type checker exits zero | before reviews |
| Test | The project's test command exits zero for the changed areas | before reviews |
| Lint | The project's linter exits zero for the changed areas | before reviews |
| Migration | If a migration was added, applying it to a fresh database exits zero and rolling it back exits zero | before reviews |
| Browser | If the change touches user-visible behavior, the browser evidence is attached | before reviews |
| Security scan | If the project has a security scanner configured, it exits zero or with no new findings | before reviews |

The set of mandatory gates is derived from the project. A project
without a build script does not have a build gate. A project with a
configured security scanner has a security gate; the executor does not
have to add one.

## Optional gates

Optional gates are recorded as evidence and surfaced in the
`/cycle evidence` listing. They do not block the workflow.

| Gate | When |
|---|---|
| Performance budget | The project has a performance budget, the candidate respects it |
| Accessibility | The candidate is checked against the project's accessibility rules |
| Internationalization | The candidate is checked for missing translations |
| Visual regression | The candidate is checked against the project's visual baseline |

## Status rules

- `passed` is set only when the gate's verification command exits zero
  and produces no fatal signal in the output digest. A warning in the
  output is not a fatal signal; the project may declare specific
  warnings as fatal in `~/.mavis/cycle/config.json`.
- `failed` is set when the command exits non-zero or the output contains
  a fatal signal. The evidence record's `output_digest` lets a reviewer
  or the arbiter inspect the failure without re-running the command.
- `skipped` is set when the gate is not applicable to this candidate. A
  skipped gate is not a failed gate. The executor is responsible for
  marking applicability, not for skipping to avoid a failure.

## Manual gates

Some gates cannot be automated. A security-relevant UI change that
requires a human to confirm "this is not a phishing surface" is a
manual gate. The executor prompts the user with a clear question,
captures the response as a `manual` evidence record, and the workflow
proceeds.

A manual gate that the user declines converts to a `failed` evidence
record with the user's reason in `notes`. The workflow then either
repairs (if the gap is fixable) or replans (if the gap is structural).

## Re-verification

A reviewer or the arbiter may re-verify a gate. The re-verification
writes a new evidence record referencing the original record by id.
The re-verification is what advances the workflow, not the original
record. The original record is preserved for the audit trail.
