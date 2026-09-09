# Routing

The control plane picks the route when a workflow starts. The coordinator passes
the exact request, the known affected paths and a preference; `cycle_workflow
start` returns the mode it chose and the rationale it chose it on. No role and no
coordinator judgement participates: the same request against the same paths
produces the same route every time.

There is no command surface. The preference is a field on `start`, and it takes
`auto`, `quick` or `full`.

## What each preference does

| Preference | Result |
|---|---|
| `full` | The full cycle, always. Recorded as user-promoted, and no signal is evaluated. |
| `quick` | The quick route, even when signals fired. The signals that fired are still recorded in the rationale, so a route the user forced is visible as forced. |
| `auto` | The full cycle when any critical signal fires, the quick route when none does. |

## What the signals are

A signal is a substring of the lowercased request, or a pattern over a path.
Nothing is weighted and nothing is scored: one signal is enough to promote an
`auto` request to the full cycle.

Request markers, by category: authentication, authorization, cryptography,
secrets, persistence, payments, personal data, release, rewrite.

The markers are stems, not words, and they cover several languages at once —
`autentic` reads Italian, Spanish and Portuguese together. A cycle that answers
in the language of the request has to route on it too, or a payment change
described in any language but English takes the quick route with nothing said.

Path patterns, by category: persistence (`migrations/`, `schema/`, `.sql`),
packaging (`installer/`, `packaging/`, `release/`, `Dockerfile`), deployment
(`deploy/`, `k8s/`, `helm/`, `terraform/`), dependencies (manifest and lock
files), and CI (`.github/workflows/`).

Paths come from two places: the affected paths the caller supplied, and the paths
written in the request itself. Routing runs before anything is planned, so the
caller usually has no file list yet; the one place a path is already known is
where the person wrote it. Without reading the request, the path rules could only
ever be tested against an empty list, which is a guard that reads as armed and
never fires.

More than ten distinct paths adds the `breadth` category on its own.

## Why the markers are narrow

A rule that fires on `api` or `update` sends every request to the full cycle,
which turns the quick route into decoration and makes the product too expensive
to use for the small changes it should stay out of the way for. The markers are
deliberately specific, and the cost of that is real: a critical change described
in words none of them match takes the quick route. The quick route still freezes
an exact candidate, runs the mandatory gates and passes an arbiter, so it is
bounded rather than ungoverned — but it has no independent review, and that is
the difference the signals exist to decide.

## When the route was wrong

The route is recorded with the workflow and is part of what the arbiter sees. A
quick candidate the arbiter rejects on something two independent reviewers would
have caught is evidence the signals missed a category. Report that; do not widen
a marker to make one request behave, because a marker widened for one request
routes every future request that happens to contain the word.
