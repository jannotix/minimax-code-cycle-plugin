# Evidence gates

A workflow advances only when its mandatory gates are satisfied. A gate
is a set of evidence records with a `passed` status. Evidence is real:
a `passed` record corresponds to a command that exited zero, an
attachment that loaded, or a manual confirmation the executor captured
from a browser or a user dialog.

## What the gates are matched against

Not only the files a change touches. After the change set is computed, the
control plane asks the code graph which files consume it, and the same layer
rules are matched against the union. A line in a configuration loader imported
by something under `auth` requires the security proof even though nothing under
`auth` was edited.

Adding paths can only insert a gate and has no way to remove one, so a reach
that is wrong costs a proof nobody needed rather than losing one that was. It
lives in the evidence layer, never in routing, so the route a request takes
stays deterministic and cheap.

Two signals come out of it, and both are recorded rather than inferred:

| Signal | Meaning |
|---|---|
| `impact:unresolved` | What the change reaches could not be determined, with the reason and the command that fixes it. Warns under `standard` and `advisory`; refuses under `strict`. |
| `impact:high-fan-in` | The change reaches more of the project than the threshold. It names the hub symbols and their consumer counts instead of expanding into hundreds of gates. Never mandatory: the reviewers should know, it is not a reason to refuse. |

"Nothing is affected" and "I cannot tell what is affected" are different claims,
and reporting the first when the second is true is the failure this exists to
avoid. A project that was never indexed is unresolved, not empty. A changed file
in a language the graph has no grammar for is reported as outside the model
rather than as a gap in it.

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

Optional gates are recorded as evidence and returned by `cycle_workflow`
alongside the mandatory ones. They do not block the workflow.

| Gate | When |
|---|---|
| Performance budget | The project has a performance budget, the candidate respects it |
| Accessibility | The candidate is checked against the project's accessibility rules |
| Internationalization | The candidate is checked for missing translations |
| Visual regression | The candidate is checked against the project's visual baseline |

## Status rules

- `passed` is set only when the gate's verification command exits zero
  and produces no fatal signal in the output digest. A warning in the
  output is not a fatal signal, and there is no setting that promotes one:
  a project that wants a warning to fail makes its own command exit non-zero.
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
