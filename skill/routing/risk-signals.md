# Routing

`/cycle run [auto|quick|full]` selects a route. The route determines
which gates run. `auto` picks a route from deterministic risk signals.
The signals are derived from the original request, the project, and the
graph index, never from the agent's prior state.

## Route definitions

| Route | Plan | Execution | Verification | Reviews | Arbitration |
|---|---|---|---|---|---|
| `quick` | skipped unless `/cycle plan` was used | one bounded task | mandatory gate | skipped | yes (one) |
| `full` | yes | one or more bounded tasks | mandatory gates | both reviewers | yes |
| `auto` | decided by signals | decided by signals | always | decided by signals | always |

`auto` never picks `quick` for changes that touch more than one layer,
changes that require schema or migration, or changes the user explicitly
marked as cross-layer or critical.

## Risk signals

The route is the worst signal wins. If any signal is `high`, the route
is `full`. If any signal is `medium` and none is `high`, the route is
`full`. If all signals are `low`, the route is `quick`.

| Signal | low | medium | high |
|---|---|---|---|
| Layer count (request mentions) | 1 | 2 | 3 or more |
| Persistence change | no | new table or column | migration affecting existing data |
| External API change | no | additive | breaking |
| Authentication or authorization change | no | new role | permission model change |
| Dependency addition | no | patch or minor | new direct dependency |
| User-visible surface area | one path | two or more paths | new screen or flow |
| Reversibility | trivially revertable | rebase-able | requires manual rollback |
| Test coverage of the area | high | medium | low or none |
| Project age in the project memory | well-known pattern | seen once | novel for the project |
| User explicit signal | "quick" | none | "full" or "critical" or "cross-layer" |

The route is reported to the user in plain language before the workflow
starts. The user can override with `quick` or `full` on the command line
to skip the signal evaluation.

## When `quick` is wrong

`quick` skips the plan and the reviewers. The executor's evidence is the
only gate before the arbiter. A `quick` workflow that ends `rejected` by
the arbiter because of a layering issue or a missing review was the
wrong route. The route decision is recorded in the audit ledger and
included in the workflow's `data` for the arbiter to inspect.

The user can request a route promotion at any point: the cycle
`/cycle review` command takes a `quick` candidate and runs the two
reviewers. The reviewers' findings are added to the existing evidence
and the arbiter re-evaluates.

## Determinism

The signal evaluation is deterministic. The same request against the
same project state produces the same route. There is no agent judgment
in the routing decision. If the user believes the route is wrong, they
override; the override is recorded.
