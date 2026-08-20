# Arbitration: <id>

Arbitration id: <uuid>
Candidate id: <uuid>
Arbiter session: <uuid>
Decision: approved | repair | replan | blocked
Created at: <iso8601>

## Original request match

satisfied | partial | unsatisfied

## Evidence sufficiency

sufficient | insufficient

## Reviewer consensus

agree | disagree | partial

## Rationale

<the user-facing paragraph>

## What the candidate does well

- <one sentence>

## What the candidate does not do, or does wrong

- <one sentence, with file:line if applicable>

## If approved

The user can rely on the candidate. The audit ledger is sealed.

## If repair

The executor must <change> and re-run <evidence>. The repair feedback
in the audit ledger carries the full instruction.

## If replan

The architect must rebuild the plan because <structural reason>. The
new plan starts from the original request and the failures so far.

## If blocked

The workflow cannot continue without a user decision. The user should
review the candidate, the reviews, and the rationale, and either
accept what is done, restart with a different scope, or cancel.
