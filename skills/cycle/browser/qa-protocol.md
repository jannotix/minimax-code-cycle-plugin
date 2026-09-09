# Browser evidence

An interface change is proved by a flow that was actually driven and by the
accessibility tree that flow produced. The rule that shapes everything below is
that the party being gated does not supply the evidence: the coordinator drives
the flow, and the independent functional reviewer judges what it produced.

## Who does what

| Party | Role in this protocol |
|---|---|
| Executor | Never drives a browser. Its capability profile has no browser tool. It returns `browser: null`. |
| Coordinator | Drives the flow itself and submits the captured snapshot with the reviewer's one-use capture token. |
| Functional reviewer | Asks for the capture, then judges the evidence the coordinator returns. |

The executor cannot clear its own gate. If a capture reaches the control plane
attributed to the executor, it is recorded under `browser:executor-report` and
`accessibility:executor-report`, neither of which is mandatory and neither of
which satisfies the interface layer. The summary says so in words: *self-reported,
recorded for the reviewers, and it does not satisfy the interface layer*. That is
not a punishment, it is the only honest reading — over stdio the control plane
cannot tell a real tree from an invented one, so a capture is worth exactly the
independence of whoever produced it.

## The two-stage exchange

1. The functional reviewer returns `browser_capture` with `snapshot: null`. That
   is a request, not evidence.
2. The coordinator drives the affected flow, then calls
   `cycle_workflow submit_browser_evidence` with the real snapshot, the
   reviewer's native `session_id`, and the one-use `capture_token` minted for
   that role when the candidate was frozen.
3. The control plane redeems the token. A submission without one carries no
   mandatory weight, because a role could otherwise clear a gate by naming itself.
4. The coordinator resumes that same reviewer session with the new evidence
   identifiers, and only then accepts its strict verdict.

The token is single use and bound to the candidate. A repaired candidate is a new
candidate, so it mints new tokens and the reviewer session is fresh.

## What the snapshot must contain

Exactly three fields, and no others:

- `capturedFlow` — the flow that was driven, in words.
- `url` — where it was driven.
- `nodes` — the accessibility tree, each node carrying `role`, `name`, `level`
  and `children`.

A snapshot with an unexpected key is rejected rather than trimmed. There are no
screenshots, DOM dumps, console logs or network logs in this contract: the
detectors read the tree, so those artifacts would be weight without a reader.

## What the detectors find

They are deterministic, run in the parent, involve no model, and cost nothing.
The same tree gives the same findings twice.

| Rule | Severity |
|---|---|
| `a11y/unnamed-control` — an interactive control with no accessible name | high |
| `a11y/unnamed-image` — an image with no accessible name | medium |
| `a11y/empty-heading` — a heading with no text | medium |
| `a11y/duplicate-main` — more than one main landmark | medium |
| `a11y/heading-order` — a gap in the heading outline | low |
| `a11y/no-main-landmark` — nothing to skip to | low |

One high finding fails `accessibility:affected-user-flow`, because a control a
screen reader cannot announce is not shipped work. Medium and low findings are
recorded in the same evidence for the reviewers to weigh, and do not block.

## When the capability is missing

The coordinator reports browser capability as `available`, `unavailable` or
`unknown` on every `cycle_coordinator next`. When the change touches an interface
file and the capability is not `available`, the workflow stops. It does not
proceed with the gate marked skipped, and `unknown` is not treated as available:
a gate that cannot run has not passed.
